using Godot;
using System;

public partial class RTSCamera : Camera3D
{
    [Export]
    public float PanSpeed = 20.0f;

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

    private float _targetHeight;

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
             _targetHeight = Mathf.Clamp(_targetHeight, MinHeight, MaxHeight);
         }
    }

    private void ProcessMovement(float delta)
    {
        Vector3 direction = Vector3.Zero;

        // Using Keycodes for prototype simplicity
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
