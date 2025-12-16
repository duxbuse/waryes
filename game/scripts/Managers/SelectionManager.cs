using Godot;
using System.Collections.Generic;

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

    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb && mb.ButtonIndex == MouseButton.Left)
        {
            // Ignore if command keys are pressed (let GameManager handle it)
            if (Input.IsKeyPressed(Key.R) || Input.IsKeyPressed(Key.F) || Input.IsKeyPressed(Key.A))
            {
                return; 
            }

            GD.Print($"SelectionManager: Left mouse button, Pressed={mb.Pressed}, Dragging={_isDragging}");
            
            if (mb.Pressed)
            {
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
        }
    }

    private void SelectAt(Vector2 screenPos)
    {
        ClearSelection();
        
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return;

        var from = camera.ProjectRayOrigin(screenPos);
        var to = from + camera.ProjectRayNormal(screenPos) * 1000.0f;

        var spaceState = GetViewport().World3D.DirectSpaceState;
        var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF); // All masks
        
        // Raycast
        var result = spaceState.IntersectRay(query);
        if (result.Count > 0)
        {
            var collider = result["collider"].As<Node>();
            
            // Travel up to find Unit class (in case we hit a child shape)
            Unit unit = GetUnitFromCollider(collider);
            
            if (unit != null)
            {
                AddUnit(unit);
            }
        }
    }
    
    private void SelectInRect(Vector2 start, Vector2 end)
    {
        ClearSelection();
        
        var rect = GetScreenRect(start, end);
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return;
        
        // Brute force check all units (efficient enough for <5000 units on CPU usually)
        // Optimization: Use PhysicsShapeQuery with a ConvexPolygon created from camera frustum planes
        // For prototype: Screen-space check
        
        foreach (var unit in UnitManager.Instance.GetActiveUnits())
        {
            if (!IsInstanceValid(unit) || unit.IsQueuedForDeletion()) continue;
            
            Vector2 screenPos = camera.UnprojectPosition(unit.GlobalPosition);
            
            // Check if on screen (Unproject returns weird values if behind camera)
            if (camera.IsPositionBehind(unit.GlobalPosition)) continue;
            
            if (rect.HasPoint(screenPos))
            {
                AddUnit(unit);
            }
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

    private void ClearSelection()
    {
        foreach (var unit in SelectedUnits)
        {
            if (IsInstanceValid(unit) && !unit.IsQueuedForDeletion())
            {
                unit.SetSelected(false);
            }
        }
        SelectedUnits.Clear();
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
