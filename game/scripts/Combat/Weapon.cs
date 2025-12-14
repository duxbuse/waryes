using Godot;
using WarYes.Data;

public partial class Weapon : Node
{
    public string WeaponId { get; private set; }
    public float Range { get; set; } = 50.0f; // in meters (game units)
    public float Damage { get; set; } = 1.0f;
    public float FireRate { get; set; } = 1.0f; // shots per second
    public float AimTime { get; set; } = 1.0f; // Seconds to aim before firing
    public float Accuracy { get; set; } = 0.8f; // 0.0 to 1.0
    public float Cooldown { get; private set; } = 0.0f;
    private Unit _owner;

    public void Initialize(Unit owner, string weaponId)
    {
        _owner = owner;
        WeaponId = weaponId;
        
        // Simulating data lookup for now (should come from a centralized Weapon Database)
        if (weaponId.Contains("cannon"))
        {
            Range = 40.0f; // Reduced from 80
            Damage = 2.5f; // Reduced from 5
            FireRate = 0.25f; // Slower: 1 shot per 4s (Cooldown)
            AimTime = 2.0f; // Takes 2s to aim
            Accuracy = 0.7f; // 30% miss chance
        }
        else if (weaponId.Contains("rifle") || weaponId.Contains("gun"))
        {
            Range = 20.0f; // Reduced from 40
            Damage = 0.5f; // Reduced from 1
            FireRate = 1.0f; // Slower: 1 shot per second
            AimTime = 0.5f; // Fast aim
            Accuracy = 0.9f;
        }
    }

    public Unit CurrentTarget { get; private set; }
    public float CurrentAimTimer { get; private set; }

    public void Engage(Unit target)
    {
        if (target != CurrentTarget)
        {
            CurrentTarget = target;
            CurrentAimTimer = AimTime;
        }
    }

    public void StopEngaging()
    {
        CurrentTarget = null;
        CurrentAimTimer = 0;
    }

    public override void _Process(double delta)
    {
        if (Cooldown > 0)
        {
            Cooldown -= (float)delta;
        }

        if (CurrentTarget != null)
        {
            if (!IsInstanceValid(CurrentTarget) || CurrentTarget.IsQueuedForDeletion())
            {
                StopEngaging();
                return;
            }

            if (CurrentAimTimer > 0)
            {
                CurrentAimTimer -= (float)delta;
            }
            else
            {
                // Aimed
                if (CanFire())
                {
                    Fire(CurrentTarget);
                    // Reset aim? Usually keep aimed at same target.
                    // But maybe slight delay?
                    // For now, machine gun style (continuous fire).
                }
            }
        }
    }

    public bool CanFire()
    {
        return Cooldown <= 0;
    }

    public void Fire(Unit target)
    {
        if (!CanFire()) return;

        Cooldown = 1.0f / FireRate;
        
        // Accuracy Check
        float roll = GD.Randf();
        bool isAccurate = roll <= Accuracy;
        
        Vector3 targetPos = target.GlobalPosition;
        
        if (!isAccurate)
        {
            // Calculate a miss point (e.g. 2-5m away from target)
            Vector2 randomCircle = new Vector2(GD.Randf() * 2 - 1, GD.Randf() * 2 - 1).Normalized();
            float missDistance = 3.0f + GD.Randf() * 5.0f;
            Vector3 offset = new Vector3(randomCircle.X, 0, randomCircle.Y) * missDistance;
            targetPos += offset;
        }

        // Spawn Projectile
        var projectile = new Projectile();
        
        // Add to main scene root to decouple from unit rotation
        _owner.GetTree().Root.AddChild(projectile);
        projectile.GlobalPosition = _owner.GlobalPosition + Vector3.Up * 2.0f; // Fire from "turret" height

        projectile.Initialize(_owner, target, Damage, isAccurate, targetPos);
    }
}
