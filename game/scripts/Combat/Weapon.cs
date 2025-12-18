using Godot;
using WarYes.Data;
using System.Collections.Generic;

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

    public bool IsGuided { get; set; } = false;
    public float ProjectileSpeed { get; set; } = 250.0f; // Default fast
    public float TurnSpeed { get; set; } = 0.0f;
    
    private List<Projectile> _activeProjectiles = new List<Projectile>();
    
    // Check if we are currently guiding a projectile
    public bool IsGuiding 
    { 
        get 
        { 
            CleanProjectileList();
            return IsGuided && _activeProjectiles.Count > 0; 
        } 
    }

    public void BreakGuidance()
    {
        CleanProjectileList();
        foreach (var p in _activeProjectiles)
        {
            p.StopGuiding();
        }
        _activeProjectiles.Clear();
    }
    
    public int SupplyCost { get; set; } = 1;
    public int SalvoLength { get; set; } = 1;
    private int _shotsInSalvoFired = 0;
    public float ReloadTime { get; set; } = 4.0f;

    private void CleanProjectileList()
    {
        _activeProjectiles.RemoveAll(p => p == null || !IsInstanceValid(p) || p.IsQueuedForDeletion());
    }

    public void Initialize(Unit owner, string weaponId, int maxAmmo = -1)
    {
        _owner = owner;
        WeaponId = weaponId;
        
        var stats = UnitManager.Instance.GetWeaponStats(weaponId);
        if (stats != null)
        {
             float groundRange = stats.Range.Ground ?? 0;
         float airRange = stats.Range.Air ?? 0;
         Range = System.Math.Max(groundRange, airRange);
             AP = stats.Penetration;
             
             // Parse Damage "0.3 HE"
             string dmgStr = stats.Damage.Split(' ')[0];
             if (float.TryParse(dmgStr, out float dmg)) Damage = dmg;
             else Damage = 1.0f;
             
             // Base Fire Rate in RPM -> Hz handled in logic or converted?
             // If we use FireRate as Shots Per Second:
             // But we have Burst mechanics now.
             // FireRate property calculates per Rank. _baseFireRate should be RPM / 60?
             // The user request says "rate of fire is 600... 600/60 = 10 rounds per second".
             // So stats.RateOfFire is RPM.
             _baseFireRate = (float)stats.RateOfFire / 60.0f;
             
             AimTime = stats.AimTime;
             ReloadTime = stats.ReloadTime;
             SalvoLength = stats.SalvoLength > 0 ? stats.SalvoLength : 1;
             SupplyCost = stats.SupplyCost;
             
             IsGuided = stats.IsGuided;
             ProjectileSpeed = stats.ProjectileSpeed;
             TurnSpeed = stats.TurnSpeed;
             
             // Accuracy
             _baseAccuracy = (float)stats.Accuracy.Static / 100.0f; // Assuming 0-100 in JSON
             
             // Fallbacks if 0
             if (ProjectileSpeed <= 0) ProjectileSpeed = IsGuided ? 50f : 250f;
        }
        else
        {
             GD.PrintErr($"Weapon: Stats not found for {weaponId}, using defaults.");
             // Default fallback (keep existing hardcoded blocks if desired, or just generic)
             SalvoLength = 1;
        }
        
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
        _shotsInSalvoFired = 0; // Reset burst if interrupted?
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

        // Burst / Reload Logic
        _shotsInSalvoFired++;
        
        if (_shotsInSalvoFired < SalvoLength)
        {
             // Inter-shot delay
             // RateOfFire is shots per second.
             Cooldown = 1.0f / FireRate; 
        }
        else
        {
             // Salvo Complete -> Reload
             Cooldown = ReloadTime;
             _shotsInSalvoFired = 0;
        }

        if (MaxAmmo > 0)
        {
            CurrentAmmo--;
            if (CurrentAmmo <= 0)
            {
                StopEngaging();
                _owner.CheckAmmoStatus(true);
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
        
        _activeProjectiles.Add(projectile);
        
        // Add to main scene root to decouple from unit rotation
        _owner.GetTree().Root.AddChild(projectile);
        projectile.GlobalPosition = _owner.GlobalPosition + Vector3.Up * 2.0f; // Fire from "turret" height

        projectile.Initialize(_owner, target, AP, Damage, isAccurate, targetPos, IsGuided, ProjectileSpeed, TurnSpeed, SalvoLength);
    }
}
