using Godot;
using System;

public partial class RTSCamera : Camera3D
{
    [Export]
    public float PanSpeed = 40.0f;

    [Export]
    public float RotationSpeed = 2.0f;

    [Export]
    public float ZoomSpeed = 2.0f;

    [Export]
    public float MinHeight = 5.0f;

    [Export]
    public float MaxHeight = 50.0f;

    [Export]
    public float MinZoom = 5.0f;
    
    [Export] 
    public float MaxZoom = 40.0f;

    [Export]
    public float EdgePanMargin = 20.0f;

    [Export]
    public float DragSensitivity = 1.0f;

    private float _targetHeight;
    private bool _isDragging = false;

    public override void _Ready()
    {
        _targetHeight = 40.0f; // Start zoomed out to see battlefield
        Position = new Vector3(Position.X, _targetHeight, Position.Z);
    }

    public override void _Process(double delta)
    {
        ProcessMovement((float)delta);
        
        // Smoothly interpolate to target height
        Vector3 pos = Position;
        pos.Y = Mathf.Lerp(pos.Y, _targetHeight, 5.0f * (float)delta);
        Position = pos;
    }

    public override void _UnhandledInput(InputEvent @event)
    {
         if (@event is InputEventMouseButton mb) 
         {
             if (mb.ButtonIndex == MouseButton.WheelUp && mb.Pressed)
             {
                 _targetHeight -= ZoomSpeed;
             }
             else if (mb.ButtonIndex == MouseButton.WheelDown && mb.Pressed)
             {
                 _targetHeight += ZoomSpeed;
             }
             else if (mb.ButtonIndex == MouseButton.Middle)
             {
                 _isDragging = mb.Pressed;
             }

             _targetHeight = Mathf.Clamp(_targetHeight, MinHeight, MaxHeight);
         }
         else if (@event is InputEventMouseMotion mm && _isDragging)
         {
            // Drag Panning
            // Move opposite to mouse movement
            // Scale by height to make it feel consistent at different zooms
            float zoomFactor = Position.Y / MaxHeight; 
            Vector3 dragMove = new Vector3(-mm.Relative.X, 0, -mm.Relative.Y) * DragSensitivity * zoomFactor * 0.1f;
            
            // Align with camera orientation
            Vector3 globalDrag = (GlobalTransform.Basis.Z * dragMove.Z + GlobalTransform.Basis.X * dragMove.X);
            globalDrag.Y = 0;
            
            Position += globalDrag;
         }
    }

    private void ProcessMovement(float delta)
    {
        Vector3 direction = Vector3.Zero;
        
        // Edge Panning
        var viewport = GetViewport();
        if (viewport == null) return;

        var mousePos = viewport.GetMousePosition();
        var visibleRect = viewport.GetVisibleRect();
        var size = visibleRect.Size;

        // Check window focus to prevent panning when tabbed out (though _Process usually pauses, good practice)
        if (DisplayServer.WindowIsFocused())
        {
            if (mousePos.X < EdgePanMargin)
            {
                direction += Vector3.Left;
            }
            if (mousePos.X > size.X - EdgePanMargin)
            {
                direction += Vector3.Right;
            }
            if (mousePos.Y < EdgePanMargin)
            {
                direction += Vector3.Forward; // Up on screen is Forward in 3D usually (Z-) assuming looking down
            }
            if (mousePos.Y > size.Y - EdgePanMargin)
            {
                direction += Vector3.Back; // Down on screen is Back in 3D (Z+)
            }
        }

        // WASD Panning (Only when NO units are selected to avoid overlap with 'A' attack command)
        if (SelectionManager.Instance == null || SelectionManager.Instance.SelectedUnits.Count == 0)
        {
            if (Input.IsKeyPressed(Key.W))
            {
                direction += Vector3.Forward;
            }
            if (Input.IsKeyPressed(Key.S))
            {
                direction += Vector3.Back;
            }
            if (Input.IsKeyPressed(Key.A))
            {
                direction += Vector3.Left;
            }
            if (Input.IsKeyPressed(Key.D))
            {
                direction += Vector3.Right;
            }
        }

        if (direction != Vector3.Zero)
        {
            direction = direction.Normalized();
            
            // Move relative to global coordinates but flattened on XZ plane
            Vector3 globalMove = (GlobalTransform.Basis.Z * direction.Z + GlobalTransform.Basis.X * direction.X);
            globalMove.Y = 0;
            globalMove = globalMove.Normalized();

            Position += globalMove * PanSpeed * delta;
        }
    }
}
