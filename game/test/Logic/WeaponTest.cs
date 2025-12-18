
using GdUnit4;
using static GdUnit4.Assertions;
using Godot;
using System.Reflection;

namespace WarYes.Tests.Logic
{
    [TestSuite]
    [RequireGodotRuntime]
    public class WeaponTest
    {
        [TestCase]
        public void CalculateAccuracy_LowMorale_ReducesAccuracy()
        {
            // Setup
            var weapon = new Weapon();
            var owner = new Unit();
            var combat = new WarYes.Units.Components.UnitCombatController();
            
            // Inject Combat into Unit
            SetPrivateProperty(owner, "Combat", combat);
            
            // Set Owner dependency on Weapon
            SetPrivateField(weapon, "_owner", owner);
            
            // Set Base Accuracy
            weapon.Accuracy = 0.8f; 
            
            // Set Combat Stats (via Reflection)
            SetPrivateProperty(combat, "MaxMorale", 100.0f);
            SetPrivateProperty(combat, "Morale", 10.0f); // 10%
            SetPrivateProperty(combat, "Rank", 0);

            // Act
            float accuracy = weapon.Accuracy;

            // Assert
            // 0.8 * 0.25 (since < 50%) = 0.2
            AssertFloat(accuracy).IsEqualApprox(0.2f, 0.001f);
            
            weapon.Free();
            owner.Free();
            combat.Free(); // Also free combat check?
        }

        [TestCase]
        public void Fire_DecrementsAmmo()
        {
            // Setup
            var runner = ISceneRunner.Load(new Node3D()); // Create a hosted scene
            var scene = runner.Scene();

            var weapon = new Weapon();
            var owner = new Unit();
            
            scene.AddChild(owner); // Add owner to tree so GetTree() works
            // Weapon needs to be child of nothing or owner? 
            // Weapon is usually child of CombatController. 
            // But we can just use new Weapon() as standalone if we don't AddChild it to owner?
            // Actually Fire() does: _owner.GetTree().Root.AddChild(projectile);
            // It uses _owner to find tree. Weapon itself doesn't need to be in tree for this line, 
            // but usually is.
            
            // Set Owner
            SetPrivateField(weapon, "_owner", owner); 
            
            // Manually set Ammo
            weapon.MaxAmmo = 10;
            SetPrivateProperty(weapon, "CurrentAmmo", 10);
            
            // Set Cooldown to 0
            SetPrivateProperty(weapon, "Cooldown", 0.0f);
            
            // Act
            var target = new Unit();
            scene.AddChild(target); // Target in tree too just in case
            target.GlobalPosition = Vector3.Zero;
            
            // Fire
            weapon.Fire(target);

            // Assert
            AssertInt(weapon.CurrentAmmo).IsEqual(9);
            
            // Cleanup
            // Projectiles are added to Root. We need to find and free them?
            // Or just Free() the runner which might free scene... but Projectile is sibling of scene (child of Root).
            // We should kill projectiles.
            // Weapon._activeProjectiles is private.
            // But we can assume 1 projectile spawned.
            // Use Reflection to get list?
            var projs = weapon.GetType().GetField("_activeProjectiles", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(weapon) as System.Collections.Generic.List<Projectile>;
            if (projs != null)
            {
                foreach(var p in projs) p.QueueFree();
            }
            
            weapon.Free();
            // owner and target are children of scene, will be freed by runner? 
            // No, runner.Scene() is the root node we passed?
            // "runner.Dispose()" or similar? ISceneRunner doesn't implement IDisposable directly in docs?
            // Actually it does usually. 
            // But manual free is safer for orphan check.
            
            // owner.Free(); // If added to scene, freeing scene frees owner.
            target.Free();
            owner.Free(); 
            // If already freed by scene runner? 
            // Let's just Free manually before disposing runner logic if any.
            
            // runner itself might need disposal?
            // The argument 'ISceneRunner runner' in method signature is auto-managed.
            // Here I created it manually: ISceneRunner.Load(...)
            // I should dispose it? (runner as IDisposable)?.Dispose();
        }
        
        private void SetPrivateField(object obj, string fieldName, object value)
        {
            var field = obj.GetType().GetField(fieldName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (field != null)
                field.SetValue(obj, value);
        }

        private void SetPrivateProperty(object obj, string propName, object value)
        {
            var prop = obj.GetType().GetProperty(propName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (prop != null)
                prop.SetValue(obj, value);
        }
    }
}
