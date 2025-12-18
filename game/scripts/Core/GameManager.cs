using Godot;
using System.Collections.Generic;
using System.Linq;
using WarYes.Data;
using WarYes.UI;

public partial class GameManager : Node
{
	public static GameManager Instance { get; private set; }
	
	// Core Managers
	public UnitManager UnitManager;
	public EconomyManager EconomyManager;
	public ObjectiveManager ObjectiveManager;
	public DeploymentManager DeploymentManager;
	public InputManager InputManager; 
	
	// Data
	public DeckData PlayerDeck;
	private Dictionary<string, DivisionData> _divisions;
	private Dictionary<string, UnitData> _unitLibrary;

	// UI
	public DeploymentUI DeploymentUI;
	public event System.Action<UnitCard?> OnDeploymentSelectionChanged;
	
	private UnitCard _selectedCardForPlacement;
	public UnitCard SelectedCardForPlacement 
	{ 
		get => _selectedCardForPlacement;
		set
		{
			if (_selectedCardForPlacement != value)
			{
				_selectedCardForPlacement = value;
				OnDeploymentSelectionChanged?.Invoke(_selectedCardForPlacement);
			}
		}
	}

	public enum GamePhase { Setup, Battle }
	public GamePhase CurrentPhase { get; private set; } = GamePhase.Setup;

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
		
		DeploymentManager = new DeploymentManager();
		AddChild(DeploymentManager);
		
		InputManager = new InputManager(); // Handles Input
		AddChild(InputManager);
		
		// Load Data
		_unitLibrary = DataLoader.LoadUnits();
		_divisions = DataLoader.LoadDivisions();
		
		// Wait a frame for things to initialize, then setup match
		CallDeferred(nameof(StartSetupPhase));
	}
	
	// _Process delegated to Managers (DeploymentManager has _Process)
	// _UnhandledInput delegated to InputManager

	private void StartSetupPhase()
	{
		GD.Print("GameManager: Starting Setup Phase...");
		
		// Setup Deployment Zones
		DeploymentManager.SetupDeploymentZones();
		
		// Create Test Deck
		if (GameGlobal.Instance != null && GameGlobal.Instance.SelectedDeck != null)
		{
			PlayerDeck = GameGlobal.Instance.SelectedDeck;
			GD.Print($"GameManager: Using Selected Deck: {PlayerDeck.Division?.Name ?? "Unknown"}");
		}
		else if (_divisions.ContainsKey("sdf_101st_airborne"))
		{
			PlayerDeck = DeckBuilder.BuildDefaultDeck(_divisions["sdf_101st_airborne"], _unitLibrary);
			GD.Print($"GameManager: Created default deck for {PlayerDeck.Division.Name}");
		}
		else
		{
			GD.PrintErr("GameManager: Could not find 'sdf_101st_airborne' division.");
		}

		EconomyManager.StartEconomy(); 
		ObjectiveManager.StartMatch(); 
		
		// Setup UI
		var hudLayer = new CanvasLayer();
		hudLayer.Name = "HUD";
		AddChild(hudLayer);
		
		DeploymentUI = new DeploymentUI();
		DeploymentUI.Name = "DeploymentUI";
		hudLayer.AddChild(DeploymentUI);

		// Settings Menu
		var settingsScene = GD.Load<PackedScene>("res://scenes/UI/Components/SettingsMenu.tscn");
		if (settingsScene != null)
		{
			var settingsMenu = settingsScene.Instantiate<Control>();
			hudLayer.AddChild(settingsMenu);
		}
		else
		{
			GD.PrintErr("Failed to load SettingsMenu.tscn");
		}
		
		// Unit Selection Panel (Bottom Left)
		var selectionPanel = new UnitSelectionPanel();
		selectionPanel.Name = "UnitSelectionPanel";
		hudLayer.AddChild(selectionPanel);
	}
	
	public void StartBattle()
	{
		CurrentPhase = GamePhase.Battle;
		GD.Print("GameManager: Battle Phase Started!");
		
		if (DeploymentUI != null) DeploymentUI.OnBattleStarted();
		DeploymentManager.OnBattleStarted(); // Hides visual
		
		// Unfreeze Units
		foreach(var unit in UnitManager.GetActiveUnits())
		{
			unit.SetFrozen(false);
		}
	}

	private void OnMatchEnded(string winner)
	{
		GD.Print($"GAME OVER! Winner: {winner}");
		GetTree().Paused = true;
	}
}
