using Godot;
using WarYes.Data;

public partial class Unit : CharacterBody3D
{
    public UnitData Data;
    public bool IsMoving = false;
    
    private NavigationAgent3D _navAgent;
    private MeshInstance3D _visuals;
    private CollisionShape3D _collisionShape;
    private MeshInstance3D _selectionData;
    private Node3D _visualRoot; // Visual pivot for altitude

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
        Data = data;
        Name = data.Id;
        
        float speedKmh = Data.Speed.Road > 0 ? Data.Speed.Road : 30.0f;
        float speedMs = speedKmh / 3.6f;
        _navAgent.MaxSpeed = speedMs;
        
        CreateVisuals();
    }
    
    private void CreateVisuals()
    {
        // Create Visual Root (Visual Pivot)
        if (GetNodeOrNull("VisualRoot") == null)
        {
            _visualRoot = new Node3D();
            _visualRoot.Name = "VisualRoot";
            AddChild(_visualRoot);
        }
        else
        {
            _visualRoot = GetNode<Node3D>("VisualRoot");
        }
        
        // Create Mesh
        if (_visualRoot.GetNodeOrNull("Mesh") == null)
        {
            _visuals = new MeshInstance3D();
            _visuals.Name = "Mesh";
            var mesh = new BoxMesh();
            mesh.Size = new Vector3(2, 2, 2); 
            _visuals.Mesh = mesh;
            _visualRoot.AddChild(_visuals);
        }
        else
        {
             _visuals = _visualRoot.GetNode<MeshInstance3D>("Mesh");
        }
        
        // Coloring Logic
        var material = new StandardMaterial3D();
        
        bool isVehicle = Data.Fuel.HasValue;
        bool isAir = speedMsFromKmh(Data.Speed.Road) > 300.0f / 3.6f; // Heuristic for air
        
        if (isAir)
        {
             // Orange for Air
             material.AlbedoColor = new Color(1, 0.5f, 0); 
             // Visual Offset for Altitude
             _visualRoot.Position = new Vector3(0, 15, 0); 
        }
        else if (isVehicle)
        {
             // Green for Vehicles
             material.AlbedoColor = new Color(0, 1, 0);
        }
        else
        {
             // Blue for Infantry
             material.AlbedoColor = new Color(0, 0, 1);
        }
        
        _visuals.MaterialOverride = material;

        // Collision Logic
        if (GetNodeOrNull("CollisionShape3D") == null)
        {
            _collisionShape = new CollisionShape3D();
            _collisionShape.Name = "CollisionShape3D";
            var shape = new BoxShape3D(); 
            shape.Size = new Vector3(2, 2, 2);
            _collisionShape.Shape = shape;
            AddChild(_collisionShape);
        }
        
        // Selection Ring
        CreateSelectionRing();
    }
    
    private void CreateSelectionRing()
    {
        if (_visualRoot.GetNodeOrNull("SelectionRing") != null)
        {
            _selectionData = _visualRoot.GetNode<MeshInstance3D>("SelectionRing");
            _selectionData.Visible = false;
            return;
        }

        _selectionData = new MeshInstance3D();
        _selectionData.Name = "SelectionRing";
        
        // Torus mesh for ring
        var torus = new TorusMesh();
        torus.InnerRadius = 1.5f;
        torus.OuterRadius = 1.7f;
        _selectionData.Mesh = torus;
        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(1, 1, 1); // White
        mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        _selectionData.MaterialOverride = mat;
        
        _selectionData.Visible = false;
        _visualRoot.AddChild(_selectionData);
    }
    
    public void SetSelected(bool selected)
    {
        if (_selectionData != null)
        {
            _selectionData.Visible = selected;
        }
    }
    
    private float speedMsFromKmh(float kmh) => kmh / 3.6f;

    public void MoveTo(Vector3 position)
    {
        _navAgent.TargetPosition = position;
        IsMoving = true;
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

        // Face direction of movement
        if (Velocity.LengthSquared() > 0.1f)
        {
             // We rotate the BODY, so the visual root rotates with it
             Vector3 lookTarget = GlobalPosition + Velocity;
             if (GlobalPosition.DistanceSquaredTo(lookTarget) > 0.001f)
             {
                 LookAt(lookTarget, Vector3.Up);
             }
        }

        MoveAndSlide();
    }
}
