using Godot;

public partial class Projectile : Node3D
{
    private Unit _target;
    private Unit _owner;
    private float _ap; // Changed from _damage
    private float _speed = 50.0f;
    private Vector3 _lastKnownTargetPos;
    
    // Visual
    private MeshInstance3D _visual;

    private bool _isAccurate = true;
    private Vector3 _targetPosOverride;

    private Vector3 _fireOrigin;

    public void Initialize(Unit owner, Unit target, int ap, bool isAccurate, Vector3 targetPosOverride)
    {
        _owner = owner;
        _target = target;
        _ap = ap;
        _isAccurate = isAccurate;
        _targetPosOverride = targetPosOverride;
        
        // Cache fire origin to prevent accessing _owner after death
        if (IsInstanceValid(owner))
            _fireOrigin = owner.GlobalPosition;
        else
            _fireOrigin = GlobalPosition;

        if (isAccurate)
             _lastKnownTargetPos = target.GlobalPosition;
        else
             _lastKnownTargetPos = targetPosOverride;
    }

    public override void _Ready()
    {
        _visual = new MeshInstance3D();
        var mesh = new PrismMesh(); // Looks like a bullet/arrow
        mesh.Size = new Vector3(0.5f, 0.5f, 2.0f);
        _visual.Mesh = mesh;
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(1, 1, 0); // Yellow tracer
        mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        _visual.MaterialOverride = mat;
        AddChild(_visual);
        
        // Point forward - only if we have a valid direction
        if (GlobalPosition.DistanceSquaredTo(_lastKnownTargetPos) > 0.01f)
        {
            LookAt(_lastKnownTargetPos, Vector3.Up);
        }
    }

    public override void _Process(double delta)
    {
        Vector3 targetPos = _lastKnownTargetPos;
        
        if (_isAccurate && IsInstanceValid(_target))
        {
            // Update tracking only if accurate
            targetPos = _target.GlobalPosition + Vector3.Up; 
            _lastKnownTargetPos = targetPos;
        }

        Vector3 toTarget = targetPos - GlobalPosition;
        float dist = toTarget.Length();
        float moveDist = _speed * (float)delta;
        
        if (moveDist > 0.0f)
            LookAt(targetPos, Vector3.Up);
        
        if (dist <= moveDist)
        {
            // Hit logic
             GlobalPosition = targetPos;
             
             if (_isAccurate && IsInstanceValid(_target))
             {
                 OnHit();
             }
             else
             {
                 // Missed (hit ground/air)
                 QueueFree();
             }
        }
        else
        {
            // Move
            GlobalPosition += toTarget.Normalized() * moveDist;
        }
        
        // Failsafe lifetime check using cached position if owner is dead
        Vector3 checkPos = IsInstanceValid(_owner) ? _owner.GlobalPosition : _fireOrigin;
        if (GlobalPosition.DistanceSquaredTo(checkPos) > 20000.0f) 
        {
            QueueFree();
        }
    }

    private void OnHit()
    {
        if (IsInstanceValid(_target))
        {
            // Use cached origin
            int finalDamage = DamageCalculator.ResolveHit((int)_ap, _target, _fireOrigin);
            
            // Safe Owner Logic
            string ownerName = IsInstanceValid(_owner) ? _owner.Name : "Unknown(Dead)";
            
            if (finalDamage > 0)
            {
                 GD.Print($"Hit! {ownerName} damaged {_target.Name} for {finalDamage} (AP: {_ap})");
                 _target.TakeDamage(finalDamage);
            }
            else
            {
                 GD.Print($"Ricochet! {ownerName} hit {_target.Name} (AP: {_ap}) but did 0 damage.");
            }
        }
        else
        {
             // Hit ground/nothing
        }
        
        // Visual impact?
        QueueFree();
    }
     // Helper for FormPrismMesh (not in default Godot API? BoxMesh is safer)
    /* 
       Note: 'FormPrismMesh' might be a typo for 'PrismMesh'. 
       Using BoxMesh scaled to look like lines for safety.
    */
}
