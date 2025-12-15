using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class GameManager : Node
{
	public static GameManager Instance { get; private set; }
	
	public UnitManager UnitManager;
	public EconomyManager EconomyManager;
	public WarYes.Data.DeckData PlayerDeck;

	private Dictionary<string, WarYes.Data.DivisionData> _divisions;
	private Dictionary<string, WarYes.Data.UnitData> _unitLibrary;

	public DeploymentUI DeploymentUI;
	public WarYes.Data.UnitCard SelectedCardForPlacement;

	public override void _Ready()
	{
		Instance = this;
		
		// Setup Managers
		UnitManager = new UnitManager();
		UnitManager.Name = "UnitManager";
		AddChild(UnitManager);

		EconomyManager = new EconomyManager();
		EconomyManager.Name = "EconomyManager";
		AddChild(EconomyManager);
		
		ObjectiveManager = new ObjectiveManager();
		ObjectiveManager.Name = "ObjectiveManager";
		ObjectiveManager.MatchEnded += OnMatchEnded;
		AddChild(ObjectiveManager);
		
		// Load Data
		_unitLibrary = DataLoader.LoadUnits();
		_divisions = DataLoader.LoadDivisions();

		// Wait a frame for things to initialize, then setup match
		CallDeferred(nameof(StartSetupPhase));
	}
	
	public ObjectiveManager ObjectiveManager;

	private void StartSetupPhase()
	{
		GD.Print("GameManager: Starting Setup Phase...");
		
		// Create Test Deck
		if (_divisions.ContainsKey("sdf_101st_airborne"))
		{
			PlayerDeck = DeckBuilder.BuildDefaultDeck(_divisions["sdf_101st_airborne"], _unitLibrary);
			GD.Print($"GameManager: Created deck for {PlayerDeck.Division.Name} with {PlayerDeck.Cards.Count} cards.");
		}
		else
		{
			GD.PrintErr("GameManager: Could not find 'sdf_101st_airborne' division.");
		}

		EconomyManager.StartEconomy(); // Start income ticking
		ObjectiveManager.StartMatch(); // Start scoring ticks
		
		// Setup UI
		DeploymentUI = new DeploymentUI();
		DeploymentUI.Name = "DeploymentUI";
		AddChild(DeploymentUI);
		
		// VERIFICATION: Test Veterancy
		// CallDeferred(nameof(SetupVeterancyTest));
	}

	private void SetupVeterancyTest()
	{
		GD.Print("VERIFICATION: Setting up Veterancy Test...");
		
		// 1. Spawn Friendly Unit (Rank 0)
		// Find a valid unit ID
		string friendlyId = _unitLibrary.Keys.FirstOrDefault(k => !k.Contains("enemy"));
		if (friendlyId == null) friendlyId = "rifleman"; // Fallback
		
		var friendly = UnitManager.SpawnUnit(friendlyId, new Vector3(0, 0, 0), 0);
		if (friendly != null)
		{
			 GD.Print($"VERIFICATION: Spawned Friendly {friendly.Name}. Rank: {friendly.Rank}, FireRate: {friendly.GetNode<Weapon>("Weapon")?.FireRate}");
		}
		
		// 2. Spawn Enemy Target (Low HP)
		string enemyId = _unitLibrary.Keys.FirstOrDefault(k => k.Contains("enemy"));
		if (enemyId == null) enemyId = "enemy_rifleman";
		
		var enemy = UnitManager.SpawnUnit(enemyId, new Vector3(0, 0, 20), 0); // 20m away
		if (enemy != null)
		{
			 enemy.TakeDamage(enemy.Health - 1); // Set to 1 HP
			 GD.Print($"VERIFICATION: Spawned Enemy {enemy.Name} with 1 HP.");
		}
		
		// The friendly should scan, see enemy, fire, kill, and gain XP.
		// Monitor logs.
	}

	public bool SpawnUnitFromCard(WarYes.Data.UnitCard card, Vector3 position)
	{
		if (card.AvailableCount > 0)
		{
			if (EconomyManager.SpendCredits(card.Cost))
			{
				UnitManager.SpawnUnit(card.UnitId, position, card.Veterancy);
				card.AvailableCount--;
				GD.Print($"Spawned {card.UnitId}. Remaining: {card.AvailableCount}. Credits: {EconomyManager.CurrentCredits}");
				DeploymentUI?.UpdateCardVisuals(card);
				return true;
			}
			else
			{
				GD.Print($"Cannot afford {card.UnitId} (Cost: {card.Cost}, Funds: {EconomyManager.CurrentCredits})");
				return false;
			}
		}
		else
		{
			GD.Print($"No availability for {card.UnitId}");
			return false;
		}
	}

	public override void _UnhandledInput(InputEvent @event)
	{
		if (@event is InputEventMouseButton mb && mb.Pressed)
		{
			// Right Click: Move Units or Cancel Placement
			if (mb.ButtonIndex == MouseButton.Right)
			{
				if (SelectedCardForPlacement != null)
				{
					SelectedCardForPlacement = null;
					GD.Print("Placement Cancelled");
					GetViewport().SetInputAsHandled();
				}
				else
				{
					HandleMoveCommand(mb);
				}
			}
			// Left Click: Place Unit or Select
			else if (mb.ButtonIndex == MouseButton.Left)
			{
				if (SelectedCardForPlacement != null)
				{
					HandlePlacement(mb);
					GetViewport().SetInputAsHandled();
				}
			}
		}
		
		if (@event.IsActionPressed("ui_cancel"))
		{
			SelectedCardForPlacement = null;
			GD.Print("Placement Cancelled");
		}
	}

	private void HandlePlacement(InputEventMouseButton mb)
	{
		var camera = GetViewport().GetCamera3D();
		if (camera == null) return;
		
		var origin = camera.ProjectRayOrigin(mb.Position);
		var dir = camera.ProjectRayNormal(mb.Position);
		var plane = new Plane(Vector3.Up, 0);
		var intersection = plane.IntersectsRay(origin, dir);
		
		if (intersection.HasValue)
		{
			bool success = SpawnUnitFromCard(SelectedCardForPlacement, intersection.Value);
			
			// Allow multiple placement if Shift is held AND we successfully spawned AND we have units left
			bool multiPlace = mb.ShiftPressed && success && SelectedCardForPlacement.AvailableCount > 0;

			if (!multiPlace)
			{
				SelectedCardForPlacement = null; 
			}
		}
	}

	private void HandleMoveCommand(InputEventMouseButton mb)
	{
		var selectedUnits = SelectionManager.Instance?.SelectedUnits;
		if (selectedUnits == null || selectedUnits.Count == 0) return;
		
		var camera = GetViewport().GetCamera3D();
		if (camera == null) return;
		
		// Raycast to ground plane (Y=0)
		var origin = camera.ProjectRayOrigin(mb.Position);
		var dir = camera.ProjectRayNormal(mb.Position);
		
		var plane = new Plane(Vector3.Up, 0);
		var intersection = plane.IntersectsRay(origin, dir);
		
		if (intersection.HasValue)
		{
			GD.Print($"Commanding move to: {intersection.Value}");

			foreach (var unit in selectedUnits)
			{
				if (!IsInstanceValid(unit) || unit.IsQueuedForDeletion()) continue;

				// Adding small random offset so they don't stack perfectly
				Vector3 offset = new Vector3(GD.Randf() * 2 - 1, 0, GD.Randf() * 2 - 1);
				unit.MoveTo(intersection.Value + offset);
			}
			
			
			GetViewport().SetInputAsHandled();
		}
	}

	private void OnMatchEnded(string winner)
	{
		GD.Print($"GAME OVER! Winner: {winner}");
		GetTree().Paused = true;
	}
}
