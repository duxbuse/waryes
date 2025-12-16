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

	// Drag Formation State
	private bool _isRightDragging = false;
	private Vector2 _dragStartPos;
	private List<Vector3> _dragPoints = new List<Vector3>();
	private ImmediateMesh _dragVisualMesh;
	private MeshInstance3D _dragVisualInstance;
	private const float DRAG_THRESHOLD_SQ = 256.0f; // 16px squared


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
		
		// Setup Drag Visuals
		_dragVisualMesh = new ImmediateMesh();
		_dragVisualInstance = new MeshInstance3D();
		_dragVisualInstance.Mesh = _dragVisualMesh;
		_dragVisualInstance.TopLevel = true;
		_dragVisualInstance.Name = "DragVisuals";
		
		var dragMat = new StandardMaterial3D();
		dragMat.AlbedoColor = new Color(0, 1, 1, 0.8f); // Cyan
		dragMat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
		dragMat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
		_dragVisualInstance.MaterialOverride = dragMat;
		
		AddChild(_dragVisualInstance);

		// Wait a frame for things to initialize, then setup match
		CallDeferred(nameof(StartSetupPhase));
	}
	
	public ObjectiveManager ObjectiveManager;

	private void StartSetupPhase()
	{
		GD.Print("GameManager: Starting Setup Phase...");
		
		// Create Test Deck
		// Check for GameGlobal Deck
		if (GameGlobal.Instance != null && GameGlobal.Instance.SelectedDeck != null)
		{
			PlayerDeck = GameGlobal.Instance.SelectedDeck;
			GD.Print($"GameManager: Using Selected Deck: {PlayerDeck.Division?.Name ?? "Unknown"}");
		}
		// Fallback to Test Deck if no Global Deck (e.g. run from Scene directly)
		else if (_divisions.ContainsKey("sdf_101st_airborne"))
		{
			PlayerDeck = DeckBuilder.BuildDefaultDeck(_divisions["sdf_101st_airborne"], _unitLibrary);
			GD.Print($"GameManager: Created default deck for {PlayerDeck.Division.Name} with {PlayerDeck.Cards.Count} cards.");
		}
		else
		{
			GD.PrintErr("GameManager: Could not find 'sdf_101st_airborne' division.");
		}

		EconomyManager.StartEconomy(); // Start income ticking
		ObjectiveManager.StartMatch(); // Start scoring ticks
		
		// Setup UI
		var hudLayer = new CanvasLayer();
		hudLayer.Name = "HUD";
		AddChild(hudLayer);
		
		DeploymentUI = new DeploymentUI();
		DeploymentUI.Name = "DeploymentUI";
		hudLayer.AddChild(DeploymentUI);
		
		// Unit Selection Panel (Bottom Left)
		var selectionPanel = new UnitSelectionPanel();
		selectionPanel.Name = "UnitSelectionPanel";
		hudLayer.AddChild(selectionPanel);
		
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
		if (@event is InputEventMouseButton mb)
		{
			if (mb.ButtonIndex == MouseButton.Right)
			{
				if (mb.Pressed)
				{
					if (SelectedCardForPlacement != null)
					{
						SelectedCardForPlacement = null;
						GD.Print("Placement Cancelled");
						GetViewport().SetInputAsHandled();
					}
					else
					{
						// Start Potential Drag
						_isRightDragging = false; // Not dragging yet (wait for threshold)
						_dragStartPos = mb.Position;
						_dragPoints.Clear();
						_dragVisualMesh.ClearSurfaces();
					}
				}
				else // Released
				{
					if (_isRightDragging)
					{
						// Finish Drag
						FinishDragFormation(mb);
						_isRightDragging = false;
						_dragPoints.Clear();
						_dragVisualMesh.ClearSurfaces();
						GetViewport().SetInputAsHandled();
					}
					else if (SelectedCardForPlacement == null)
					{
						// Normal Click
						IssueMoveCommand(mb, Unit.MoveMode.Normal);
					}
				}
			}
			else if (mb.ButtonIndex == MouseButton.Left && mb.Pressed)
			{
				bool isCommand = false;
				Unit.MoveMode commandMode = Unit.MoveMode.Normal;
				
				if (Input.IsKeyPressed(Key.R)) { isCommand = true; commandMode = Unit.MoveMode.Reverse; }
				else if (Input.IsKeyPressed(Key.F)) { isCommand = true; commandMode = Unit.MoveMode.Fast; }
				else if (Input.IsKeyPressed(Key.A)) { isCommand = true; commandMode = Unit.MoveMode.Hunt; }
				
				if (isCommand)
				{
					IssueMoveCommand(mb, commandMode);
				}
				else if (SelectedCardForPlacement != null)
				{
					HandlePlacement(mb);
					GetViewport().SetInputAsHandled();
				}
			}
		}
		else if (@event is InputEventMouseMotion mm)
		{
			if (Input.IsMouseButtonPressed(MouseButton.Right) && SelectedCardForPlacement == null)
			{
				if (!_isRightDragging)
				{
					if (mm.Position.DistanceSquaredTo(_dragStartPos) > DRAG_THRESHOLD_SQ)
					{
						_isRightDragging = true;
						_dragPoints.Clear();
						// Add start point
						AddDragPoint(_dragStartPos);
					}
				}
				
				if (_isRightDragging)
				{
					AddDragPoint(mm.Position);
					UpdateDragVisuals();
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

	private void AddDragPoint(Vector2 screenPos)
	{
		var camera = GetViewport().GetCamera3D();
		if (camera == null) return;
		
		var plane = new Plane(Vector3.Up, 0);
		var origin = camera.ProjectRayOrigin(screenPos);
		var dir = camera.ProjectRayNormal(screenPos);
		var intersection = plane.IntersectsRay(origin, dir);
		
		if (intersection.HasValue)
		{
			Vector3 point = intersection.Value;
			// Filter close points
			if (_dragPoints.Count == 0 || _dragPoints[_dragPoints.Count - 1].DistanceSquaredTo(point) > 1.0f) // 1m
			{
				_dragPoints.Add(point);
			}
		}
	}

	private void UpdateDragVisuals()
	{
		_dragVisualMesh.ClearSurfaces();
		if (_dragPoints.Count < 2) return;
		
		_dragVisualMesh.SurfaceBegin(Mesh.PrimitiveType.LineStrip);
		foreach(var p in _dragPoints)
		{
			_dragVisualMesh.SurfaceAddVertex(p + Vector3.Up * 0.5f);
		}
		_dragVisualMesh.SurfaceEnd();
	}

	private void FinishDragFormation(InputEventMouseButton mb)
	{
		var selectedUnits = SelectionManager.Instance?.SelectedUnits;
		if (selectedUnits == null || selectedUnits.Count == 0) return;
		
		List<Unit> validUnits = selectedUnits.Where(u => IsInstanceValid(u) && !u.IsQueuedForDeletion()).ToList();
		if (validUnits.Count == 0 || _dragPoints.Count < 2) return;
		
		GD.Print($"Executing Drag Formation with {validUnits.Count} units along {_dragPoints.Count} points.");
		
		// Resample path to get exactly 'Count' points roughly equidistant
		float totalLength = 0;
		for(int i=0; i<_dragPoints.Count-1; i++) totalLength += _dragPoints[i].DistanceTo(_dragPoints[i+1]);
		
		// If path is super short (just a jitter), treat as normal move?
		if (totalLength < 5.0f) 
		{
			IssueMoveCommand(mb, Unit.MoveMode.Normal);
			return;
		}
		
		float spacing = totalLength / Mathf.Max(1, validUnits.Count - 1);
		
		List<Vector3> targetPositions = new List<Vector3>();
		List<Vector3> targetFacings = new List<Vector3>();
		
		// Generate Points along path
		// Naive approach: Walk the path
		float currentDist = 0;
		int currentSegIdx = 0;
		Vector3 currentSegStart = _dragPoints[0];
		// Initial point
		
		for(int i=0; i<validUnits.Count; i++)
		{
			float targetDist = i * spacing;
			if (i == validUnits.Count - 1) targetDist = totalLength; // Force last point
			
			// Find position at targetDist
			// ... logic to walk segments ...
			// Quick implementation:
			Vector3 pos = GetPointAtDistance(targetDist, ref currentSegIdx);
			targetPositions.Add(pos);
			
			// Determine Facing
			// Logic: Standard = Perpendicular to path (Outward?)
			// Or User Intent?
			// If curved (e.g. U-shape), they want to face OUT from the U?
			// Simple heuristic: Face Direction of Path Normal (Right Hand Rule?)?
			// Or standard RTS: Face same direction as dragged?
			// "Painter" usually means "Face this way". 
			// Wait, user said: "if the user traces out a line then the units should all face the same direcetion towards the enemy"
			// "if the user traces out a shape with a clear curve then the units should face outwards from the curve such that each other protects the rears."
			
			// Let's calculate Curvature.
			// Getting Normal at point.
			Vector3 tangent = GetTangentAtDistance(targetDist, currentSegIdx); // Direction of path
			Vector3 normal = tangent.Cross(Vector3.Up); // Right side
			
			// Check Curvature? 
			// For now, let's implement "Face Normal (Right)". If user draws Left->Right, they face Forward (North?).
			// If user draws Right->Left, they face Back.
			// If user draws Circle (CW), they face Out/In?
			
			// Let's defaulting to "Face Normal (Right of Path)". 
			// Drawing Left-to-Right on screen (West to East) -> Tangent East. Cross(Up) -> South.
			// Usually drag-move (Total War) defines the line Front. So they face Perpendicular.
			
			targetFacings.Add(normal);
		}
		
		// Assign Units
		AssignUnitsToFormation(validUnits, targetPositions, targetFacings, Unit.MoveMode.Normal, mb.ShiftPressed);
	}
	
	private Vector3 GetPointAtDistance(float dist, ref int startIdx)
	{
		float walked = 0;
		// Re-calculate walked based on startIdx optimized? No, keep simple
		// Recalc full?
		for(int i=0; i<startIdx; i++) walked += _dragPoints[i].DistanceTo(_dragPoints[i+1]);
		
		for(int i=startIdx; i<_dragPoints.Count-1; i++)
		{
			float segLen = _dragPoints[i].DistanceTo(_dragPoints[i+1]);
			if (walked + segLen >= dist)
			{
				startIdx = i; // Update cache
				float t = (dist - walked) / segLen;
				return _dragPoints[i].Lerp(_dragPoints[i+1], t);
			}
			walked += segLen;
		}
		return _dragPoints.Last();
	}

	private Vector3 GetTangentAtDistance(float dist, int segIdx)
	{
		// Simple: Direction of current segment
		if (segIdx >= _dragPoints.Count - 1) segIdx = _dragPoints.Count - 2;
		return (_dragPoints[segIdx+1] - _dragPoints[segIdx]).Normalized();
	}

	private void AssignUnitsToFormation(List<Unit> units, List<Vector3> positions, List<Vector3> facings, Unit.MoveMode mode, bool shift)
	{
		// Greedy assignment again
		var availableIndices = Enumerable.Range(0, units.Count).ToList();
		
		for(int i=0; i<positions.Count; i++)
		{
			Vector3 target = positions[i];
			Unit bestUnit = null;
			float minD = float.MaxValue;
			int bestIdxIdx = -1;
			
			for(int j=0; j<availableIndices.Count; j++)
			{
				int uIdx = availableIndices[j];
				float d = units[uIdx].GlobalPosition.DistanceSquaredTo(target);
				if (d < minD)
				{
					minD = d;
					bestUnit = units[uIdx];
					bestIdxIdx = j;
				}
			}
			
			if (bestUnit != null)
			{
				// Calculate Final Facing Target
				// Unit.FinalFacing is a Direction Vector? Or a Target Position to look at?
				// My Unit.cs logic used: currentForward.AngleTo(targetForward)
				// So it expects a Direction Vector (Normalized).
				
				bestUnit.MoveTo(target, mode, shift, facings[i]);
				availableIndices.RemoveAt(bestIdxIdx);
			}
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

	private void IssueMoveCommand(InputEventMouseButton mb, Unit.MoveMode mode)
	{
		var selectedUnits = SelectionManager.Instance?.SelectedUnits;
		if (selectedUnits == null || selectedUnits.Count == 0) return;
		
		var camera = GetViewport().GetCamera3D();
		if (camera == null) return;
		
		var from = camera.ProjectRayOrigin(mb.Position);
		var dir = camera.ProjectRayNormal(mb.Position);
		var to = from + dir * 2000.0f;
		
		// 1. Raycast for Unit (Attack)
		var spaceState = GetViewport().World3D.DirectSpaceState;
		var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF);
		var result = spaceState.IntersectRay(query);
		
		bool shiftHeld = mb.ShiftPressed;
		
		if (result.Count > 0)
		{
			 var collider = result["collider"].As<Node>();
			 if (collider is CollisionShape3D cs) collider = cs.GetParent();
			 
			 // If right-click (Normal) or Hunt-click (Attack Move) on an enemy -> Attack Unit
			 if (collider is Unit targetUnit && targetUnit.Team == "Enemy" && (mode == Unit.MoveMode.Normal || mode == Unit.MoveMode.Hunt))
			 {
				 GD.Print($"Commanding Attack on {targetUnit.Name}");
				 foreach(var unit in selectedUnits)
				 {
					 if (!IsInstanceValid(unit)) continue;
					 unit.Attack(targetUnit, shiftHeld);
				 }
				 GetViewport().SetInputAsHandled();
				 return;
			 }
		}

// 2. Raycast to ground
		var plane = new Plane(Vector3.Up, 0);
		var intersection = plane.IntersectsRay(from, dir);
		
		if (intersection.HasValue)
		{
			GD.Print($"Commanding move to: {intersection.Value} (Mode: {mode})");

			List<Unit> validUnits = new List<Unit>();
			foreach (var u in selectedUnits)
			{
				if (IsInstanceValid(u) && !u.IsQueuedForDeletion()) validUnits.Add(u);
			}

			if (validUnits.Count > 0)
			{
				var positions = GetFormationPositions(intersection.Value, validUnits.Count, 4.0f);
				
				// Optimization: Assign closest unit to closest point to minimize crossover
				// Simple greedy assignment for now (can be improved with Hungarian algo if needed)
				
				// Create a pool of available indices
				List<int> availableIndices = Enumerable.Range(0, validUnits.Count).ToList();
				
				// For each position, find the closest available unit
				for (int i = 0; i < positions.Count; i++)
				{
					Vector3 targetPos = positions[i];
					
					Unit bestUnit = null;
					float minDistSq = float.MaxValue;
					int bestIndexIdx = -1;

					// Find closest unit to this specific target position
					for (int j = 0; j < availableIndices.Count; j++)
					{
						int unitIdx = availableIndices[j];
						float d = validUnits[unitIdx].GlobalPosition.DistanceSquaredTo(targetPos);
						if (d < minDistSq)
						{
							minDistSq = d;
							bestUnit = validUnits[unitIdx];
							bestIndexIdx = j;
						}
					}

					if (bestUnit != null)
					{
						bestUnit.MoveTo(targetPos, mode, shiftHeld);
						availableIndices.RemoveAt(bestIndexIdx);
					}
				}
			}
			
			GetViewport().SetInputAsHandled();
		}
	}

	private List<Vector3> GetFormationPositions(Vector3 center, int count, float spacing)
	{
		var positions = new List<Vector3>();
		if (count == 0) return positions;

		positions.Add(center); // First unit takes the center
		int remaining = count - 1;
		
		int ringIndex = 1;
		while (remaining > 0)
		{
			float radius = ringIndex * spacing;
			float circumference = 2 * Mathf.Pi * radius;
			int unitsInRing = Mathf.Max(1, Mathf.FloorToInt(circumference / spacing));
			
			// Distribute units evenly on the ring
			for (int i = 0; i < unitsInRing && remaining > 0; i++)
			{
				float angle = i * (2 * Mathf.Pi / unitsInRing);
				Vector3 pos = new Vector3(Mathf.Sin(angle) * radius, 0, Mathf.Cos(angle) * radius);
				positions.Add(center + pos);
				remaining--;
			}
			ringIndex++;
		}
		
		return positions;

	}

	private void OnMatchEnded(string winner)
	{
		GD.Print($"GAME OVER! Winner: {winner}");
		GetTree().Paused = true;
	}
}
