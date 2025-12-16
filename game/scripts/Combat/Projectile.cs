using Godot;

public partial class Projectile : Node3D
{
    private Unit _target;
    private Unit _owner;
    private bool _isGuided = false;
    private float _turnSpeed = 0.0f;
    private Vector3 _velocity;
    private int _ap;
    private float _damageMultiplier;
    private bool _isAccurate;
    private Vector3 _targetPosOverride;
    private float _speed;
    private Vector3 _fireOrigin;
    private Vector3 _lastKnownTargetPos;
    private MeshInstance3D _visual;

    private int _salvoSize = 1;

    public void Initialize(Unit owner, Unit target, int ap, float damageMultiplier, bool isAccurate, Vector3 targetPosOverride, bool isGuided, float speed, float turnSpeed, int salvoSize = 1)
    {
        _owner = owner;
        _target = target;
        _ap = ap;
        _damageMultiplier = damageMultiplier;
        _isAccurate = isAccurate;
        _targetPosOverride = targetPosOverride;
        
        _isGuided = isGuided;
        _speed = speed > 0 ? speed : (_isGuided ? 50.0f : 250.0f); // Fallback defaults
        _turnSpeed = turnSpeed;
        _salvoSize = salvoSize;

        // Cache fire origin to prevent accessing _owner after death
        if (IsInstanceValid(owner))
            _fireOrigin = owner.GlobalPosition;
        else
            _fireOrigin = GlobalPosition;

        if (isAccurate && IsInstanceValid(target))
             _lastKnownTargetPos = target.GlobalPosition + Vector3.Up;
        else
             _lastKnownTargetPos = targetPosOverride;

        // Initialize Velocity
        Vector3 direction = (_lastKnownTargetPos - GlobalPosition).Normalized();
        _velocity = direction * _speed;
    }

    public override void _Ready()
    {
        _visual = new MeshInstance3D();
        var mesh = new BoxMesh(); // More reliable for orientation than PrismMesh
        
        if (_isGuided)
        {
             // Missile Shape
            mesh.Size = new Vector3(0.4f, 0.4f, 2.0f); // Long in Z
            var mat = new StandardMaterial3D();
            mat.AlbedoColor = new Color(1, 0, 0); // Red
            mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
            _visual.MaterialOverride = mat;
        }
        else
        {
            // Tracer Shape
            // Scale based on Salvo Size
            float baseWidth = 0.15f;
            float baseLength = 3.0f;
            
            float width = baseWidth;
            float length = baseLength;
            
            if (_salvoSize >= 10) 
            {
                width = baseWidth / 10.0f; // Very thin
                length = baseLength * 0.25f; // Shortened (0.75m)
            }
            else if (_salvoSize >= 3) 
            {
                width = baseWidth / 3.0f;
                length = baseLength * 0.66f; // (2m)
            }
            
            mesh.Size = new Vector3(width, width, length); 
            var mat = new StandardMaterial3D();
            mat.AlbedoColor = new Color(1, 1, 0.5f); // Bright Yellow
            mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
            _visual.MaterialOverride = mat;
        }

        _visual.Mesh = mesh;
        AddChild(_visual);
        
        // Point forward
        if (_velocity.LengthSquared() > 0.01f)
        {
            LookAt(GlobalPosition + _velocity, Vector3.Up);
        }
    }

    public override void _Process(double delta)
    {
        if (_isGuided && IsInstanceValid(_target))
        {
            // Guided Logic
            Vector3 desiredDirection = ((_target.GlobalPosition + Vector3.Up) - GlobalPosition).Normalized();
            
            // Rotate current velocity towards desired direction
            // Simple Slerp or RotateToward
            Vector3 currentDir = _velocity.Normalized();
            
            // Calculate max rotation for this frame (Radians)
            float maxRot = Mathf.DegToRad(_turnSpeed) * (float)delta;
            
            // Need a robust way to rotate vector. 
            // Slerp on vectors works if they are normalized.
            Vector3 newDir = currentDir;
            
            // Avoid issues if vectors are collinear and opposite
            if (currentDir.Dot(desiredDirection) < -0.99f)
            {
                // Turn anywhere
                 newDir = currentDir.Rotated(Vector3.Up, maxRot);
            }
            else
            {
                 // Manually Limit rotation?
                 // Or just use Slerp with a factor? Slerp factor is t (0-1).
                 // We have a max angle. 
                 // Let's use Godot's RotateToward if available on Vector3? No (only float).
                 // Slerp: interpolated vector. We need to check angle difference.
                 float angle = currentDir.AngleTo(desiredDirection);
                 if (angle > 0.001f)
                 {
                     // If angle is smaller than maxRot, we can just snap.
                     // If larger, we Slerp by (maxRot / angle)
                     float t = Mathf.Min(maxRot / angle, 1.0f);
                     newDir = currentDir.Slerp(desiredDirection, t).Normalized();
                 }
            }
            
            _velocity = newDir * _speed;
            
            // Re-orient visual
            if (_velocity.LengthSquared() > 0.1f)
                LookAt(GlobalPosition + _velocity, Vector3.Up);
        }
        else
        {
            // Unguided / Ballistic - Fly straight
            // No velocity change.
        }

        Vector3 oldPos = GlobalPosition;
        Vector3 displacement = _velocity * (float)delta;
        
        // Hit Detection (Raycast style check for high speed)
        float moveDist = displacement.Length();
        
        // Update Orientation for Unguided as well
        if (!_isGuided && _velocity.LengthSquared() > 0.1f)
        {
             LookAt(GlobalPosition + _velocity, Vector3.Up);
        }
        
        // Check if we passed the target point? 
        // For unguided: we just check collisions with target or ground.
        // For guided: check distance to target.
        
        // Simplified Hit Check:
        // If we are close enough to Target?
        if (IsInstanceValid(_target))
        {
             Vector3 targetCenter = _target.GlobalPosition + Vector3.Up;
             // Distance check to sphere
             // If we moved past the closest point on line? 
             // Simple version: If distance < threshold
             if (GlobalPosition.DistanceSquaredTo(targetCenter) < 4.0f) // 2m radius
             {
                 GlobalPosition = targetCenter;
                 OnHit();
                 return;
             }
        }
        
        // Move
        GlobalPosition += displacement;
        
        // Miss check logic?
        // Old logic: checked if dist <= moveDist to _lastKnownTargetPos.
        // For Unguided, we are flying to a point in space.
        // If we Reach the "Target Point" (the point where we aimed), we terminate / miss.
        if (!_isGuided)
        {
             float distToDest = GlobalPosition.DistanceTo(_lastKnownTargetPos);
             // If we passed it or are very close?
             // Or just check if we hit the ground (y <= 0)
             if (distToDest < moveDist || (GlobalPosition - _fireOrigin).Dot(displacement) > 0 && (_lastKnownTargetPos - _fireOrigin).Length() < (GlobalPosition - _fireOrigin).Length())
             {
                 // We passed the target point
                 // Check if we hit anything along the way? 
                 // (Assuming simplified collision: we only hit the intended target in this game mostly)
                 
                 // If we didn't hit the target (handled above), then it's a miss
                 OnMiss();
                 return;
             }
        }

        // Failsafe lifetime
        if (GlobalPosition.DistanceSquaredTo(_fireOrigin) > 250000.0f) // 500m
        {
            QueueFree();
        }
    }
    
    public void StopGuiding()
    {
        _isGuided = false;
        // Keep flying straight (velocity preserved)
    }

    private void OnMiss()
    {
         // Explosion / Suppression Logic
         // ... Reusing logic from old Process
         if (IsInstanceValid(_target))
         {
             int armor = DamageCalculator.GetProjectedArmor(_target, _fireOrigin);
             float potDamage = DamageCalculator.CalculateDamage(_ap, armor, _damageMultiplier);
             
             if (potDamage > 0)
             {
                 float suppression = potDamage * 1.5f;
                 _target.TriggerSuppressionImpact(suppression, _fireOrigin);
             }
         }
         QueueFree();
    }

    private void OnHit()
    {
        if (IsInstanceValid(_target))
        {
            // Use cached origin
            float finalDamage = DamageCalculator.ResolveHit(_ap, _damageMultiplier, _target, _fireOrigin);
            
            // Safe Owner Logic
            string ownerName = IsInstanceValid(_owner) ? _owner.Name : "Unknown(Dead)";
            
            if (finalDamage > 0)
            {
                 // GD.Print($"Hit! {ownerName} damaged {_target.Name} for {finalDamage} (AP: {_ap})");
                 _target.TakeDamage(finalDamage, _owner);
            }
            else
            {
                 // GD.Print($"Ricochet! {ownerName} hit {_target.Name} (AP: {_ap}) but did 0 damage.");
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
