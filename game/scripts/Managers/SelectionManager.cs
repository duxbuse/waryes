using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class SelectionManager : Node2D
{
    public static SelectionManager Instance { get; private set; }

    public List<Unit> SelectedUnits { get; private set; } = new List<Unit>();

    // Input state
    private bool _isDragging = false;
    private Vector2 _dragStart;
    private Vector2 _dragEnd;

    // Visuals for drag box
    [Export]
    public Color BoxColor = new Color(0, 1, 0, 0.2f); // Semi-transparent green
    [Export]
    public Color BoxBorderColor = new Color(0, 1, 0, 1.0f); // Solid green border

    public override void _Ready()
    {
        Instance = this;
        ZIndex = 100; // Draw on top of 2D
    }

    public override void _Draw()
    {
        if (_isDragging)
        {
            var rect = GetScreenRect(_dragStart, _dragEnd);
            DrawRect(rect, BoxColor, true); // Filled
            DrawRect(rect, BoxBorderColor, false, 2.0f); // Border
        }
    }

    public event System.Action OnSelectionChanged;

    private int _primaryTypeIndex = 0;
    
    public Unit GetPrimaryUnit()
    {
        if (SelectedUnits.Count == 0) return null;
        
        // Group by ID to find types
        var types = GetSelectedTypes();
        if (types.Count == 0) return SelectedUnits[0]; // Fallback
        
        // Wrap index
        if (_primaryTypeIndex >= types.Count) _primaryTypeIndex = 0;
        
        string targetId = types[_primaryTypeIndex];
        return SelectedUnits.FirstOrDefault(u => u.Data.Id == targetId);
    }
    
    public List<string> GetSelectedTypes()
    {
        // Return distinct unit IDs
        List<string> types = new List<string>();
        foreach(var u in SelectedUnits)
        {
            if (!types.Contains(u.Data.Id)) types.Add(u.Data.Id);
        }
        return types;
    }
    
    public void CycleSelectionType()
    {
        var types = GetSelectedTypes();
        if (types.Count <= 1) return;
        
        _primaryTypeIndex++;
        if (_primaryTypeIndex >= types.Count) _primaryTypeIndex = 0;
        
        OnSelectionChanged?.Invoke();
    }
    
    public void SetPrimaryType(string unitId)
    {
        var types = GetSelectedTypes();
        int idx = types.IndexOf(unitId);
        if (idx != -1)
        {
            _primaryTypeIndex = idx;
            OnSelectionChanged?.Invoke();
        }
    }

    public override void _UnhandledInput(InputEvent @event)
    {
         if (@event.IsActionPressed("ui_focus_next")) // Tab usually
         {
             CycleSelectionType();
             GetViewport().SetInputAsHandled();
             return;
         }

        if (@event is InputEventMouseButton mb && mb.ButtonIndex == MouseButton.Left)
        {
            // Ignore if command keys are pressed (let GameManager handle it)
            if (Input.IsKeyPressed(Key.R) || Input.IsKeyPressed(Key.F) || Input.IsKeyPressed(Key.A))
            {
                return; 
            }

            // Fix: Ignore selection input if we are in placement mode
            if (GameManager.Instance != null && GameManager.Instance.SelectedCardForPlacement != null)
            {
                return;
            }

            GD.Print($"SelectionManager: Left mouse button, Pressed={mb.Pressed}, Dragging={_isDragging}");
            
            if (mb.Pressed)
            {
                if (mb.DoubleClick)
                {
                    GD.Print("SelectionManager: Double click selection");
                    SelectSameTypeVisible(mb.Position);
                    _isDragging = false; 
                    GetViewport().SetInputAsHandled();
                    return;
                }

                _isDragging = true;
                _dragStart = mb.Position;
                _dragEnd = mb.Position;
            }
            else if (_isDragging)
            {
                _isDragging = false;
                _dragEnd = mb.Position;
                QueueRedraw();
                
                // Perform selection
                if (_dragStart.DistanceSquaredTo(_dragEnd) < 16) // Tiny drag = Click
                {
                    GD.Print("SelectionManager: Click selection");
                    SelectAt(_dragEnd);
                }
                else
                {
                    GD.Print("SelectionManager: Box selection");
                    SelectInRect(_dragStart, _dragEnd);
                }
                
                GetViewport().SetInputAsHandled();
            }
        }
        else if (@event is InputEventMouseMotion mm && _isDragging)
        {
            _dragEnd = mm.Position;
            QueueRedraw();
        }
        else if (@event is InputEventKey key && !key.Echo)
        {
            if (key.Keycode == Key.C)
            {
                // Toggle LOS preview on/off based on key press/release
                if (LOSPreview.Instance != null)
                {
                    LOSPreview.Instance.SetActive(key.Pressed);
                }
                GetViewport().SetInputAsHandled();
            }
             // Tab check moved to top for ease
        }
    }

    private void SelectAt(Vector2 screenPos)
    {
        // Helper to check if Shift is held (Add to selection)
        bool shift = Input.IsKeyPressed(Key.Shift);
        if (!shift) ClearSelection();
        
        Unit unit = GetUnitAt(screenPos);
        
        if (unit != null)
        {
            AddUnit(unit);
        }

        OnSelectionChanged?.Invoke();
        
        // Cancel Deployment Mode if we selected something (or even if we didn't but clicked?)
        // If we clicked a unit, we definitely want to stop placing.
        if (SelectedUnits.Count > 0 && GameManager.Instance != null)
        {
             GameManager.Instance.SelectedCardForPlacement = null;
        }
    }
    
    private void SelectSameTypeVisible(Vector2 screenPos)
    {
        Unit targetUnit = GetUnitAt(screenPos);
        if (targetUnit == null) return;
        
        bool shift = Input.IsKeyPressed(Key.Shift);
        if (!shift) ClearSelection();
        
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return;
        var viewportRect = GetViewport().GetVisibleRect();
        
        string targetId = targetUnit.Data.Id;
        
        foreach (var unit in UnitManager.Instance.GetActiveUnits())
        {
             if (!IsInstanceValid(unit) || unit.IsQueuedForDeletion()) continue;
             
             if (unit.Data.Id != targetId) continue;
             
             // Skip garrisoned or transported units
             if (unit.IsGarrisoned || unit.TransportUnit != null) continue;
             
             // Check visibility
             if (camera.IsPositionBehind(unit.GlobalPosition)) continue;
             Vector2 uScreenPos = camera.UnprojectPosition(unit.GlobalPosition);
             
             // Check if within viewport
             if (viewportRect.HasPoint(uScreenPos))
             {
                 AddUnit(unit);
             }
        }
        
        OnSelectionChanged?.Invoke();
        
        if (SelectedUnits.Count > 0 && GameManager.Instance != null)
        {
             GameManager.Instance.SelectedCardForPlacement = null;
        }
    }

    private Unit GetUnitAt(Vector2 screenPos)
    {
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return null;

        // Tactical Selection
        var rtsCamera = camera as RTSCamera;
        if (rtsCamera != null && rtsCamera.InTacticalView)
        {
            float closestDistSq = 1600.0f; // 40px radius squared (40*40)
            Unit bestUnit = null;

            foreach(var unit in UnitManager.Instance.GetActiveUnits())
            {
                 if (!IsInstanceValid(unit) || unit.IsQueuedForDeletion()) continue;
                 
                 // Ignore garrisoned units
                 if (unit.IsGarrisoned || unit.TransportUnit != null) continue;
                 
                 // Calculate icon position logic matching UnitVisualController
                 float yOffset = 2.0f;
                 if (unit.Data.Tags.Contains("air")) yOffset += 8.0f; // Air units offset
                 
                 Vector3 iconPos = unit.GlobalPosition + new Vector3(0, yOffset, 0);
                 
                 if (camera.IsPositionBehind(iconPos)) continue;
                 
                 Vector2 unitScreenPos = camera.UnprojectPosition(iconPos);
                 float distSq = unitScreenPos.DistanceSquaredTo(screenPos);
                 
                 if (distSq < closestDistSq)
                 {
                     closestDistSq = distSq;
                     bestUnit = unit;
                 }
            }
            
            if (bestUnit != null) return bestUnit;
            // Fallback to raycast if no icon clicked (maybe clicked ground near base?)
        }

        var from = camera.ProjectRayOrigin(screenPos);
        var to = from + camera.ProjectRayNormal(screenPos) * 1000.0f;

        var spaceState = GetViewport().World3D.DirectSpaceState;
        var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF); // All masks
        
        var result = spaceState.IntersectRay(query);
        if (result.Count > 0)
        {
            var collider = result["collider"].As<Node>();
            var unit = GetUnitFromCollider(collider);
            
            // Filter out garrisoned or transported units (they're invisible)
            if (unit != null && !unit.IsGarrisoned && unit.TransportUnit == null)
            {
                return unit;
            }
        }
        return null;
    }
    
    private void SelectInRect(Vector2 start, Vector2 end)
    {
        bool shift = Input.IsKeyPressed(Key.Shift);
        if (!shift) ClearSelection();
        
        var rect = GetScreenRect(start, end);
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return;
        
        foreach (var unit in UnitManager.Instance.GetActiveUnits())
        {
            if (!IsInstanceValid(unit) || unit.IsQueuedForDeletion()) continue;
            
            // Skip garrisoned or transported units (invisible)
            if (unit.IsGarrisoned || unit.TransportUnit != null) continue;
            
            Vector2 screenPos = camera.UnprojectPosition(unit.GlobalPosition);
            
            // Check if on screen (Unproject returns weird values if behind camera)
            if (camera.IsPositionBehind(unit.GlobalPosition)) continue;
            
            if (rect.HasPoint(screenPos))
            {
                AddUnit(unit);
            }
        }
        
        OnSelectionChanged?.Invoke();

        if (SelectedUnits.Count > 0 && GameManager.Instance != null)
        {
             GameManager.Instance.SelectedCardForPlacement = null;
        }
    }
    
    private Rect2 GetScreenRect(Vector2 start, Vector2 end)
    {
        var topLeft = new Vector2(Mathf.Min(start.X, end.X), Mathf.Min(start.Y, end.Y));
        var size = new Vector2(Mathf.Abs(start.X - end.X), Mathf.Abs(start.Y - end.Y));
        return new Rect2(topLeft, size);
    }
    
    private Unit GetUnitFromCollider(Node collider)
    {
        // Check self
        if (collider is Unit u) return u;
        
        // Check parents (CollisionShape -> StaticBody/Area -> Unit)
        var p = collider.GetParent();
        while (p != null)
        {
             if (p is Unit unit) return unit;
             p = p.GetParent();
        }
        return null;
    }

    public void ClearSelection()
    {
        foreach (var unit in SelectedUnits)
        {
            if (IsInstanceValid(unit) && !unit.IsQueuedForDeletion())
            {
                unit.SetSelected(false);
            }
        }
        SelectedUnits.Clear();
        _primaryTypeIndex = 0; // Reset
        // OnSelectionChanged invoked by caller (SelectAt/SelectInRect) to avoid spam? 
        // Or trigger here? Better here if called from external. But callers usually batch.
        // Let's rely on callers.
    }

    private void AddUnit(Unit unit)
    {
        if (!SelectedUnits.Contains(unit))
        {
            SelectedUnits.Add(unit);
            unit.SetSelected(true);
        }
    }
}
