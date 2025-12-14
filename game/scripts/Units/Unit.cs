using Godot;
using WarYes.Data;

public partial class Unit : CharacterBody3D
{
    public UnitData Data;
    public bool IsMoving = false;
    
    private NavigationAgent3D _navAgent;
    private MeshInstance3D _visuals;
    private CollisionShape3D _collisionShape;

    public override void _Ready()
    {
        _navAgent = new NavigationAgent3D();
        _navAgent.PathDesiredDistance = 1.0f;
        _navAgent.TargetDesiredDistance = 1.0f;
        
        // Enable Avoidance
        _navAgent.AvoidanceEnabled = true;
        _navAgent.Radius = 1.0f; 
        _navAgent.NeighborDistance = 10.0f;
        _navAgent.MaxSpeed = 20.0f;

        _navAgent.VelocityComputed += OnVelocityComputed;
        AddChild(_navAgent);
    }

    public void Initialize(UnitData data)
    {
        GD.Print($"Unit.Initialize called for {data.Id}");
        Data = data;
        Name = data.Id;
        
        float speedKmh = Data.Speed.Road > 0 ? Data.Speed.Road : 30.0f;
        float speedMs = speedKmh / 3.6f;
        _navAgent.MaxSpeed = speedMs;
        
        // Create Visuals - Moved here to force creation
        if (GetNodeOrNull("Visuals") == null)
        {
            _visuals = new MeshInstance3D();
            _visuals.Name = "Visuals";
            var mesh = new BoxMesh();
            mesh.Size = new Vector3(2, 2, 2); // Make it BIG
            var material = new StandardMaterial3D();
            material.AlbedoColor = new Color(1, 0, 0); // Red
            mesh.Material = material;
            _visuals.Mesh = mesh;
            AddChild(_visuals);
            GD.Print($"Unit {_visuals.Name} visuals created explicitly in Initialize");
        }
        
        // Physics Collision
        if (GetNodeOrNull("CollisionShape3D") == null)
        {
            _collisionShape = new CollisionShape3D();
            _collisionShape.Name = "CollisionShape3D";
            var shape = new BoxShape3D(); 
            shape.Size = new Vector3(2, 2, 2);
            _collisionShape.Shape = shape;
            AddChild(_collisionShape);
        }
    }

    public void MoveTo(Vector3 position)
    {
        _navAgent.TargetPosition = position;
        IsMoving = true;
        GD.Print($"Unit {Name} moving to {position}");
    }

    public override void _PhysicsProcess(double delta)
    {
        if (!IsMoving) return;

        if (_navAgent.IsNavigationFinished())
        {
            IsMoving = false;
            Velocity = Vector3.Zero;
            return;
        }

        Vector3 currentAgentPosition = GlobalTransform.Origin;
        Vector3 nextPathPosition = _navAgent.GetNextPathPosition();
        
        // Calculate the intended velocity (where we WANT to go)
        Vector3 newVelocity = (nextPathPosition - currentAgentPosition).Normalized();
        newVelocity *= _navAgent.MaxSpeed;

        // Tell the agent to compute a safe velocity avoiding obstacles
        _navAgent.Velocity = newVelocity;
    }

    private void OnVelocityComputed(Vector3 safeVelocity)
    {
        // This is called by the NavigationAgent after calculating avoidance
        Velocity = safeVelocity;
        
        // Debug position occasionally
        // GD.Print($"{Name} SafeVel: {safeVelocity} Pos: {GlobalPosition}");

        // Face direction of movement
        if (Velocity.LengthSquared() > 0.1f)
        {
            // Smooth look at could go here, for now instantaneous
            // Using a safe look-at to avoid errors when velocity is zero or up
             Vector3 lookTarget = GlobalPosition + Velocity;
             if (GlobalPosition.DistanceSquaredTo(lookTarget) > 0.001f)
             {
                 LookAt(lookTarget, Vector3.Up);
             }
        }

        MoveAndSlide();
    }
}
