using Godot;
using System.Collections.Generic;
using System.Linq;
using WarYes.Data;

public partial class InputManager : Node
{
    // Dependencies
    private DeploymentManager _deploymentManager => GameManager.Instance.DeploymentManager;
    private SelectionManager _selectionManager => SelectionManager.Instance; 
    
    // Drag State
    private bool _isRightDragging = false;
    private Vector2 _dragStartPos;
    private List<Vector3> _dragPoints = new List<Vector3>();
    private ImmediateMesh _dragVisualMesh;
    private MeshInstance3D _dragVisualInstance;
    private Unit _draggingUnit = null;

    private const float DRAG_THRESHOLD_SQ = 256.0f; 
    
    public override void _Ready()
    {
        Name = "InputManager";
        SetupDragVisuals();
    }
    
    private void SetupDragVisuals()
    {
        _dragVisualMesh = new ImmediateMesh();
        _dragVisualInstance = new MeshInstance3D();
        _dragVisualInstance.Mesh = _dragVisualMesh;
        _dragVisualInstance.TopLevel = true;
        _dragVisualInstance.Name = "DragVisuals";
        
        var dragMat = new StandardMaterial3D();
        dragMat.AlbedoColor = new Color(0, 1, 1, 0.8f); 
        dragMat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        dragMat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _dragVisualInstance.MaterialOverride = dragMat;
        
        AddChild(_dragVisualInstance);
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb)
        {
            if (mb.ButtonIndex == MouseButton.Right)
            {
                if (mb.Pressed)
                {
                    if (GameManager.Instance.SelectedCardForPlacement != null)
                    {
                        GameManager.Instance.SelectedCardForPlacement = null;
                        GD.Print("Placement Cancelled");
                        GetViewport().SetInputAsHandled();
                    }
                    else
                    {
                        _isRightDragging = false; 
                        _dragStartPos = mb.Position;
                        _dragPoints.Clear();
                        _dragVisualMesh.ClearSurfaces();
                    }
                }
                else // Released
                {
                    if (_isRightDragging)
                    {
                        FinishDragFormation(mb);
                        _isRightDragging = false;
                        _dragPoints.Clear();
                        _dragVisualMesh.ClearSurfaces();
                        GetViewport().SetInputAsHandled();
                    }
                    else if (GameManager.Instance.SelectedCardForPlacement == null)
                    {
                        IssueMoveCommand(mb, Unit.MoveMode.Normal);
                    }
                }
            }
            else if (mb.ButtonIndex == MouseButton.Left && mb.Pressed)
            {
                if (GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup && GameManager.Instance.SelectedCardForPlacement == null && !Input.IsKeyPressed(Key.Shift))
                {
                    var target = GetRaycastTarget(mb.Position);
                    if (target is Unit unit && unit.Team == "Player")
                    {
                        _draggingUnit = unit;
                        GetViewport().SetInputAsHandled(); 
                        return;
                    }
                }

                bool isCommand = false;
                Unit.MoveMode commandMode = Unit.MoveMode.Normal;
                bool isUnloadAt = false;
                
                if (Input.IsKeyPressed(Key.R)) { isCommand = true; commandMode = Unit.MoveMode.Reverse; }
                else if (Input.IsKeyPressed(Key.F)) { isCommand = true; commandMode = Unit.MoveMode.Fast; }
                else if (Input.IsKeyPressed(Key.A)) { isCommand = true; commandMode = Unit.MoveMode.Hunt; }
                else if (Input.IsKeyPressed(Key.E)) { isUnloadAt = true; }
                else if (Input.IsKeyPressed(Key.Z)) 
                {
                     ToggleReturnFireOnly();
                     GetViewport().SetInputAsHandled();
                     return;
                }
                
                if (isCommand)
                {
                    IssueMoveCommand(mb, commandMode);
                }
                else if (isUnloadAt)
                {
                    IssueUnloadAtCommand(mb);
                }
                else if (GameManager.Instance.SelectedCardForPlacement != null)
                {
                    HandlePlacement(mb);
                    GetViewport().SetInputAsHandled();
                }
            }
            else if (mb.ButtonIndex == MouseButton.Left && !mb.Pressed)
            {
                if (_draggingUnit != null)
                {
                    FinishDragUnit();
                    GetViewport().SetInputAsHandled();
                }
            }
        }
        
        if (@event is InputEventKey key)
        {
            if (key.Pressed)
            {
                if (key.Keycode == Key.Q)
                {
                    UnloadSelectedImmediate();
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.L)
                {
                    SellSelected();
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.Enter)
                {
                    if (GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup)
                    {
                        GameManager.Instance.StartBattle();
                        GetViewport().SetInputAsHandled();
                    }
                }
            }
            else // Released
            {
                if (key.Keycode == Key.Shift)
                {
                    if (GameManager.Instance.SelectedCardForPlacement != null)
                    {
                        GameManager.Instance.SelectedCardForPlacement = null;
                        GD.Print("Shift released: Placement Cancelled");
                        GetViewport().SetInputAsHandled();
                    }
                }
            }
        }

        else if (@event is InputEventMouseMotion mm)
        {
            if (_draggingUnit != null)
            {
                HandleDragUnitMotion(mm);
                GetViewport().SetInputAsHandled();
            }
            else if (Input.IsMouseButtonPressed(MouseButton.Right) && GameManager.Instance.SelectedCardForPlacement == null)
            {
                if (!_isRightDragging)
                {
                    if (mm.Position.DistanceSquaredTo(_dragStartPos) > DRAG_THRESHOLD_SQ)
                    {
                        _isRightDragging = true;
                        _dragPoints.Clear();
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
            GameManager.Instance.SelectedCardForPlacement = null;
            GD.Print("Placement Cancelled");
        }
    }

    private void IssueMoveCommand(InputEventMouseButton mb, Unit.MoveMode mode)
    {
        var selectedUnits = SelectionManager.Instance?.SelectedUnits;
        if (selectedUnits == null || selectedUnits.Count == 0) return;
        
        bool queue = Input.IsKeyPressed(Key.Shift);
        
        var pos = GetGroundPosition(mb.Position);
        if (pos.HasValue)
        {
             // Check for target click
             var target = GetRaycastTarget(mb.Position);
             
             if (target is Unit u && u.Team == "Enemy" && (mode == Unit.MoveMode.Normal || mode == Unit.MoveMode.Hunt))
             {
                 foreach(var sel in selectedUnits) sel.Attack(u, queue); 
                 GetViewport().SetInputAsHandled();
                 return;
             }
             else if (target is Unit uTarget && uTarget.Team == "Player" && uTarget.TransportCapacity > 0)
             {
                 // MOUNT Logic
                 // 1. Separate selected units into Transports and Passengers
                 var potentialPassengers = selectedUnits.Where(u => u.Data.Tags.Contains("infantry")).ToList();
                 var selectedTransports = selectedUnits.Where(u => u.TransportCapacity > 0).ToList();
                 
                 // If we clicked a transport that wasn't selected, add it to the pool of available transports?
                 // Design: The target transport is definitely "available". 
                 // If we have selected multiple transports, we might want to load into ALL of them.
                 // Steps:
                 // A. Targeted Transport is Primary
                 // B. If other transports are selected, they are also candidates.
                 
                 var availableTransports = new List<Unit>();
                 if (selectedTransports.Contains(uTarget)) availableTransports.AddRange(selectedTransports);
                 else availableTransports.Add(uTarget); // Target is the only one if not part of selection
                 
                 // Remove duplicates just in case
                 availableTransports = availableTransports.Distinct().ToList();

                 // Check if we even have passengers
                 if (potentialPassengers.Count == 0)
                 {
                      GD.Print("No infantry selected to mount.");
                      return;
                 }
                 
                 // C. Greedy Assignment
                 // For each transport, find closest unassigned passenger
                 var unassignedPassengers = new List<Unit>(potentialPassengers);
                 
                 foreach (var transport in availableTransports)
                 {
                     if (unassignedPassengers.Count == 0) break;
                     
                     // How many can fit? (Assuming capacity 1 for now, but loop handles N)
                     int space = transport.TransportCapacity - transport.Passengers.Count;
                     
                     for (int s=0; s<space; s++)
                     {
                         if (unassignedPassengers.Count == 0) break;
                         
                         Unit bestP = null;
                         float minD = float.MaxValue;
                         
                         foreach(var p in unassignedPassengers)
                         {
                             float d = transport.GlobalPosition.DistanceSquaredTo(p.GlobalPosition);
                             if (d < minD)
                             {
                                 minD = d;
                                 bestP = p;
                             }
                         }
                         
                         if (bestP != null)
                         {
                             // Order Pair
                             bestP.MountTransport(transport, queue);
                             transport.TransportPickUp(bestP, queue);
                             
                             unassignedPassengers.Remove(bestP);
                             GD.Print($"Pairing {transport.Name} with {bestP.Name}");
                         }
                     }
                 }
                 
                 GetViewport().SetInputAsHandled();
                 return;
             }
             else if (target is GarrisonableBuilding building)
             {
                 // Only infantry can garrison
                 var infantry = selectedUnits.Where(unit => unit.Data.Tags.Contains("infantry")).ToList();
                 if (infantry.Count > 0)
                 {
                     foreach(var sel in infantry) sel.Garrison(building, queue);
                     GD.Print($"{infantry.Count} infantry units ordered to garrison in {building.Name}");
                     GetViewport().SetInputAsHandled();
                 }
                 else
                 {
                     GD.Print("Only infantry units can garrison in buildings");
                 }
                 return;
             }
             
             // Ground Move
             if (selectedUnits.Count > 0)
             {
                 var positions = GetFormationPositions(pos.Value, selectedUnits.Count, 4.0f);
                 var validUnits = selectedUnits.Where(x => IsInstanceValid(x)).ToList();
                 
                 // Assign
                 var availableIndices = Enumerable.Range(0, validUnits.Count).ToList();
                 for (int i = 0; i < positions.Count; i++)
                 {
                    Vector3 targetPos = positions[i];
                    Unit bestUnit = null;
                    float minDistSq = float.MaxValue;
                    int bestIndexIdx = -1;

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
                        bestUnit.MoveTo(targetPos, mode, queue); 
                        availableIndices.RemoveAt(bestIndexIdx);
                    }
                 }
                 GetViewport().SetInputAsHandled();
             }
        }
    }
    
    private void IssueUnloadAtCommand(InputEventMouseButton mb) 
    {
         var pos = GetGroundPosition(mb.Position);
         if (pos.HasValue)
         {
              foreach(var sel in _selectionManager.SelectedUnits) sel.UnloadAt(pos.Value, Input.IsKeyPressed(Key.Shift));
              GetViewport().SetInputAsHandled();
         }
    }
    
    private void ToggleReturnFireOnly()
    {
         var selected = _selectionManager.SelectedUnits;
         if (selected == null || selected.Count == 0) return;
         bool anyOff = selected.Any(u => !u.IsReturnFireOnly);
         foreach(var u in selected) u.IsReturnFireOnly = anyOff;
         GD.Print($"Toggled Return Fire Only to {anyOff}");
    }
    
    private void UnloadSelectedImmediate()
    {
         foreach(var sel in _selectionManager.SelectedUnits) sel.UnloadPassengers();
    }
    
    private void SellSelected()
    {
         foreach(var sel in _selectionManager.SelectedUnits) sel.ReturnToBaseAndSell();
    }
    
    private void HandlePlacement(InputEventMouseButton mb)
    {
         var pos = GetGroundPosition(mb.Position);
         if (pos.HasValue)
         {
              bool success = _deploymentManager.SpawnUnitFromCard(GameManager.Instance.SelectedCardForPlacement, pos.Value, Input.IsKeyPressed(Key.E));
              if (success && !Input.IsKeyPressed(Key.Shift))
              {
                   GameManager.Instance.SelectedCardForPlacement = null; 
              }
         }
    }

    private void HandleDragUnitMotion(InputEventMouseMotion mm)
    {
         if (_draggingUnit == null) return;
         var pos = GetGroundPosition(mm.Position);
         if (pos.HasValue) _draggingUnit.GlobalPosition = pos.Value;
    }
    
    private void FinishDragUnit() 
    {
         if (_draggingUnit == null) return;
         if (_deploymentManager.IsValidDeploymentPosition(_draggingUnit.GlobalPosition))
         {
             GD.Print($"Moved {_draggingUnit.Name}");
         }
         _draggingUnit = null;
    }

    private void FinishDragFormation(InputEventMouseButton mb)
    {
        var selectedUnits = SelectionManager.Instance?.SelectedUnits;
        if (selectedUnits == null || selectedUnits.Count == 0) return;
        
        List<Unit> validUnits = selectedUnits.Where(u => IsInstanceValid(u) && !u.IsQueuedForDeletion()).ToList();
        if (validUnits.Count == 0 || _dragPoints.Count < 2) return;
        
        float totalLength = 0;
        for(int i=0; i<_dragPoints.Count-1; i++) totalLength += _dragPoints[i].DistanceTo(_dragPoints[i+1]);
        
        if (totalLength < 5.0f) 
        {
            IssueMoveCommand(mb, Unit.MoveMode.Normal);
            return;
        }
        
        float spacing = totalLength / Mathf.Max(1, validUnits.Count - 1);
        List<Vector3> targetPositions = new List<Vector3>();
        
        int currentSegIdx = 0;
        for(int i=0; i<validUnits.Count; i++)
        {
            float targetDist = i * spacing;
            if (i == validUnits.Count - 1) targetDist = totalLength; 
            targetPositions.Add(GetPointAtDistance(targetDist, ref currentSegIdx));
        }

        var availableIndices = Enumerable.Range(0, validUnits.Count).ToList();
        for(int i=0; i<targetPositions.Count; i++)
        {
            Vector3 target = targetPositions[i];
            Unit bestUnit = null;
            float minD = float.MaxValue;
            int bestIdxIdx = -1;
            
            for(int j=0; j<availableIndices.Count; j++)
            {
                int uIdx = availableIndices[j];
                float d = validUnits[uIdx].GlobalPosition.DistanceSquaredTo(target);
                if (d < minD)
                {
                    minD = d;
                    bestUnit = validUnits[uIdx];
                    bestIdxIdx = j;
                }
            }
            
            if (bestUnit != null)
            {
                bestUnit.MoveTo(target, Unit.MoveMode.Normal, Input.IsKeyPressed(Key.Shift));
                availableIndices.RemoveAt(bestIdxIdx);
            }
        }
    }
    
    private Vector3 GetPointAtDistance(float dist, ref int startIdx)
    {
        float walked = 0;
        for(int i=0; i<startIdx; i++) walked += _dragPoints[i].DistanceTo(_dragPoints[i+1]);
        
        for(int i=startIdx; i<_dragPoints.Count-1; i++)
        {
            float segLen = _dragPoints[i].DistanceTo(_dragPoints[i+1]);
            if (walked + segLen >= dist)
            {
                startIdx = i; 
                float t = (dist - walked) / segLen;
                return _dragPoints[i].Lerp(_dragPoints[i+1], t);
            }
            walked += segLen;
        }
        return _dragPoints.Last();
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
            if (_dragPoints.Count == 0 || _dragPoints[_dragPoints.Count - 1].DistanceSquaredTo(point) > 1.0f) 
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
        foreach(var p in _dragPoints) _dragVisualMesh.SurfaceAddVertex(p + Vector3.Up * 0.5f);
        _dragVisualMesh.SurfaceEnd();
    }
    
    private Node GetRaycastTarget(Vector2 mousePos)
    {
         var spaceState = GetViewport().World3D.DirectSpaceState;
         var camera = GetViewport().GetCamera3D();
         var from = camera.ProjectRayOrigin(mousePos);
         var to = from + camera.ProjectRayNormal(mousePos) * 1000.0f;
         var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF); // All collision
         var result = spaceState.IntersectRay(query);
         
         if (result.Count > 0)
         {
              var col = result["collider"].As<Node>();
              // Logic: Return Unit, GarrisonableBuilding, or Parent
              
              if (col is Unit u) return u;
              if (col is GarrisonableBuilding gb) return gb;
              
              // Check Parent (CollisionShape -> Body)
              var p = col.GetParent();
              if (p is Unit u2) return u2;
              if (p is GarrisonableBuilding gb2) return gb2;
              
              // Could check recursively up if needed
              return col;
         }
         return null;
    }
    
    private Vector3? GetGroundPosition(Vector2 mousePos)
    {
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return null;
        var plane = new Plane(Vector3.Up, 0);
        var origin = camera.ProjectRayOrigin(mousePos);
        var dir = camera.ProjectRayNormal(mousePos);
        return plane.IntersectsRay(origin, dir);
    }
    
    private List<Vector3> GetFormationPositions(Vector3 center, int count, float spacing)
    {
        var positions = new List<Vector3>();
        if (count == 0) return positions;

        positions.Add(center);
        int remaining = count - 1;
        
        int ringIndex = 1;
        while (remaining > 0)
        {
            float radius = ringIndex * spacing;
            float circumference = 2 * Mathf.Pi * radius;
            int unitsInRing = Mathf.Max(1, Mathf.FloorToInt(circumference / spacing));
            
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
}
