using Godot;
using WarYes.Data;
using System.Collections.Generic;
using System.Linq;

namespace WarYes.Units.Components
{
    public partial class UnitCombatController : Node3D
    {
        private Unit _unit;
        private UnitData _data;
        
        public float Health { get; private set; }
        public float MaxHealth { get; private set; }
        public float Morale { get; private set; }
        public float MaxMorale { get; private set; } = 100.0f;
        public bool IsRouting => Morale <= 0;
        
        private List<Weapon> _weapons = new List<Weapon>();
        
        public int Rank { get; private set; } = 0;
        public int CurrentExperience { get; private set; } = 0;
        
        private float _scanTimer = 0.5f;
        private const float SCAN_INTERVAL = 0.5f;
        
        public void Initialize(Unit unit, UnitData data, int rank)
        {
            _unit = unit;
            _data = data;
            Rank = rank;
            Name = "CombatController";
            
            Health = data.Health > 0 ? data.Health : 10;
            MaxHealth = Health;
            Morale = MaxMorale;
            
            if (data.Weapons != null)
            {
                foreach (var wData in data.Weapons)
                {
                    var w = new Weapon();
                    AddChild(w);
                    w.Initialize(_unit, wData.WeaponId, wData.MaxAmmo);
                    _weapons.Add(w);
                }
            }
            else
            {
                 var w = new Weapon();
                 AddChild(w);
                 string weaponId = "sdf_laser_rifle";
                 if (data.Tags.Contains("tank")) weaponId = "cannon";
                 w.Initialize(_unit, weaponId);
                 _weapons.Add(w);
            }
        }
        
        public void TakeDamage(float amount, Vector3 sourcePos)
        {
            if (_unit.IsGarrisoned) amount *= 0.5f;
            else amount *= GetTerrainCoverModifier();
            
            Health -= amount;
            
            // Apply Suppression/Morale logic (simplified for now)
            Morale -= amount * 1.5f;
            
            _unit.Visuals?.UpdateHealth((int)Health);
            _unit.Visuals?.UpdateMorale(Morale, MaxMorale, false); // Routing logic managed by Unit/Controller?
            
            GD.Print($"{_unit.Name} took {amount} damage. HP: {Health}");
            
            if (Health <= 0)
            {
                _unit.Die();
            }
        }
        
        public void ApplySuppression(float amount, Vector3 sourcePos)
        {
            // Simple Suppression Logic for now
            Morale -= amount;
            
            _unit.Visuals?.UpdateMorale(Morale, MaxMorale, IsRouting);
            
            if (IsRouting)
            {
                // Can trigger routing behavior callback here if changed
            }
        }
        
        public override void _PhysicsProcess(double delta)
        {
            // Don't process combat if unit is frozen (e.g., during setup phase)
            if (_unit.IsFrozen) return;
            
            _scanTimer -= (float)delta;
            if (_scanTimer <= 0)
            {
                _scanTimer = SCAN_INTERVAL;
                ScanAndFire();
            }
        }

        private void ScanAndFire()
        {
           if (UnitManager.Instance == null) return;
           
           List<Unit> candidates = new List<Unit>();

           // Restrict shooting from transports
           if (_unit.TransportUnit != null) 
           {
               foreach (var w in _weapons) w.StopEngaging();
               return;
           }

           float maxUnitRange = 0;
           foreach(var w in _weapons) if(w.Range > maxUnitRange) maxUnitRange = w.Range;
           float maxRangeSq = maxUnitRange * maxUnitRange;
           
           foreach (var other in UnitManager.Instance.GetActiveUnits())
           {
                if (other == null || !IsInstanceValid(other) || other.IsQueuedForDeletion()) continue;
                if (other == _unit || other.Team == _unit.Team) continue;
                
                float distSq = _unit.GlobalPosition.DistanceSquaredTo(other.GlobalPosition);
                // Simple Spotting Logic (Optics vs Stealth omitted for brevity, using Range)
                if (distSq <= maxRangeSq) 
                {
                    candidates.Add(other);
                }
           }
           
           candidates.Sort((a, b) => 
                _unit.GlobalPosition.DistanceSquaredTo(a.GlobalPosition)
                .CompareTo(_unit.GlobalPosition.DistanceSquaredTo(b.GlobalPosition)));
           
           // Return Fire Only Logic
           if (_unit.IsReturnFireOnly)
           {
                // candidates.RemoveAll(...) - requires tracking recent attackers.
                // We'll skip this for now or move recent attackers list here.
           }
           
           foreach (var w in _weapons)
           {
               Unit targetToEngage = null;
               
               if (w.CurrentTarget != null && IsInstanceValid(w.CurrentTarget))
               {
                   float distSq = _unit.GlobalPosition.DistanceSquaredTo(w.CurrentTarget.GlobalPosition);
                   if (distSq <= w.Range * w.Range && w.CanPenetrate(w.CurrentTarget) && CheckLineOfSight(w.CurrentTarget))
                   {
                       targetToEngage = w.CurrentTarget;
                   }
               }
               
               if (targetToEngage == null)
               {
                   foreach (var candidate in candidates)
                   {
                       float distSq = _unit.GlobalPosition.DistanceSquaredTo(candidate.GlobalPosition);
                       if (distSq > w.Range * w.Range) continue;
                       if (!w.CanPenetrate(candidate)) continue;
                       if (!CheckLineOfSight(candidate)) continue;
                       
                       targetToEngage = candidate;
                       break;
                   }
               }
               
               if (targetToEngage != null) w.Engage(targetToEngage);
               else w.StopEngaging();
           }
        }

        private bool CheckLineOfSight(Unit other)
        {
             var spaceState = GetWorld3D().DirectSpaceState;
             Vector3 origin = _unit.GlobalPosition + Vector3.Up * 2;
             
             // High Ground Logic
             if (_unit.IsGarrisoned && _unit.CurrentBuilding != null && _unit.CurrentBuilding.IsHighGround)
             {
                 origin = _unit.GlobalPosition + Vector3.Up * 15.0f;
             }
             
             var query = PhysicsRayQueryParameters3D.Create(origin, other.GlobalPosition + Vector3.Up * 2);
             query.Exclude = new Godot.Collections.Array<Godot.Rid> { _unit.GetRid() };
             
             var result = spaceState.IntersectRay(query);
             if (result.Count == 0) return true;
             
             var collider = result["collider"].As<Node>();
             if (collider == other) return true;
             if (collider is CollisionShape3D cs && cs.GetParent() == other) return true;
             
             return false;
        }

        public float GetMaxRange()
        {
            float max = 0;
            foreach(var w in _weapons) if(w.Range > max) max = w.Range;
            return max;
        }

        public List<Weapon> GetWeapons() => _weapons;
        
        private float GetTerrainCoverModifier()
        {
             var spaceState = GetWorld3D().DirectSpaceState;
             var from = _unit.GlobalPosition + Vector3.Up * 0.5f;
             var to = _unit.GlobalPosition + Vector3.Down * 2.0f;
             var query = PhysicsRayQueryParameters3D.Create(from, to);
             query.Exclude = new Godot.Collections.Array<Godot.Rid> { _unit.GetRid() };
             
             var result = spaceState.IntersectRay(query);
             if (result.Count > 0)
             {
                 var col = result["collider"].As<Node>();
                 if (col != null)
                 {
                     string name = col.Name.ToString();
                     if (name.Contains("ForestFloor")) return 0.8f; // 20% damage reduction in forest
                 }
             }
             return 1.0f;
        }
    }
}
