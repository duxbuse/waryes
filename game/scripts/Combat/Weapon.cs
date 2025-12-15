using Godot;
using WarYes.Data;

public partial class Weapon : Node
{
    public string WeaponId { get; private set; }
    public float Range { get; set; } = 50.0f; // in meters (game units)
    public float Damage { get; set; } = 1.0f;
    private float _baseFireRate = 1.0f;
    public float FireRate 
    { 
        get 
        {
            if (_owner == null) return _baseFireRate;
            // +20% Fire Rate per Rank
            return _baseFireRate * (1.0f + (_owner.Rank * 0.2f));
        }
        set { _baseFireRate = value; }
    }

    public float AimTime { get; set; } = 1.0f; // Seconds to aim before firing
    
    private float _baseAccuracy = 0.8f;
    public float Accuracy 
    { 
        get 
        {
            if (_owner == null) return _baseAccuracy;
            // +0.05 per rank. 
            float accuracy = Mathf.Min(_baseAccuracy + (_owner.Rank * 0.05f), 1.0f);
            
            // Morale Penalties
            float moralePercent = _owner.Morale / _owner.MaxMorale;
            if (moralePercent < 0.5f)
            {
                accuracy *= 0.25f; // < 50% Morale -> 25% Accuracy
            }
            else if (moralePercent < 1.0f)
            {
                accuracy *= 0.75f; // < 100% Morale -> 75% Accuracy
            }
            
            return accuracy;
        }
        set { _baseAccuracy = value; }
    }
    public float Cooldown { get; private set; } = 0.0f;
    public int AP { get; set; } = 1; // Default low AP
    public int MaxAmmo { get; set; } = -1; // -1 = Infinite
    public int CurrentAmmo { get; private set; } = -1;

    private Unit _owner;

    public void Initialize(Unit owner, string weaponId, int maxAmmo = -1)
    {
        _owner = owner;
        WeaponId = weaponId;
        
        // Global Ammo Limit Enforcement
        if (maxAmmo <= 0) 
        {
             MaxAmmo = 200; // Default limit for "infinite" weapons
        }
        else
        {
             MaxAmmo = maxAmmo;
        }
        
        CurrentAmmo = MaxAmmo;
        
        // Simulating data lookup for now (should come from a centralized Weapon Database)
        if (weaponId.Contains("cannon"))
        {
            Range = 40.0f; 
            Damage = 2.5f; 
            
            // Rebalanced AP (Targeting scale 20-25 for Heavy AT)
            AP = 22; 
            
            FireRate = 0.25f; // Slower: 1 shot per 4s (Cooldown)
            AimTime = 2.0f; // Takes 2s to aim
            Accuracy = 0.7f; // 30% miss chance
        }
        else if (weaponId.Contains("at_launcher"))
        {
            Range = 25.0f; // Short Range
            AP = 18; // Moderate AP (Hits Rear 8-14, Struggles vs Front 20+)
            FireRate = 0.25f; // Slow fire
            AimTime = 1.5f;
            Accuracy = 0.85f; // Good accuracy
            Damage = 1.0f; 
        }
        else if (weaponId.Contains("rifle") || weaponId.Contains("gun"))
        {
            Range = 20.0f; 
            AP = 1; // Rifles have low AP
            FireRate = 1.0f; 
            AimTime = 0.5f; 
            Accuracy = 0.9f;
        }
    }

    public Unit CurrentTarget { get; private set; }
    public float CurrentAimTimer { get; private set; }

    public void Engage(Unit target)
    {
        if (target != CurrentTarget)
        {
            if (!CanFire()) return; 
            
            // Check if we can even hurt them?
            if (!CanPenetrate(target)) 
            {
                 // Don't aim if we can't scratch them?
            }
            
            CurrentTarget = target;
            CurrentAimTimer = AimTime;
        }
    }

    public bool CanPenetrate(Unit target)
    {
        // Projected armor check
        int projectedArmor = DamageCalculator.GetProjectedArmor(target, _owner.GlobalPosition);
        int predictedDamage = (int)DamageCalculator.CalculateDamage(AP, projectedArmor, Damage);
        return predictedDamage > 0;
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
                // Check Penetration before firing
                if (CanFire() && CanPenetrate(CurrentTarget))
                {
                    Fire(CurrentTarget);
                }
                // Else: Stay aimed, wait for opportunity (flank?)
            }
        }
    }

    public bool CanFire()
    {
        if (_owner != null && _owner.IsRouting) return false;
        if (MaxAmmo > 0 && CurrentAmmo <= 0) return false;
        
        return Cooldown <= 0;
    }

    public void Fire(Unit target)
    {
        if (!CanFire()) return;

        Cooldown = 1.0f / FireRate;
        
        if (MaxAmmo > 0)
        {
            CurrentAmmo--;
            if (CurrentAmmo <= 0)
            {
                StopEngaging();
                _owner.CheckAmmoStatus();
                // GD.Print($"{_owner.Name} is out of ammo for {WeaponId}!");
            }
        }
        
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

        projectile.Initialize(_owner, target, AP, Damage, isAccurate, targetPos);
    }
}
