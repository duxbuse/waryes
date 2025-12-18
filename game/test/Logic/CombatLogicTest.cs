using GdUnit4;
using static GdUnit4.Assertions;
using Godot;
using System.Reflection;
using WarYes.Units.Components;

namespace WarYes.Tests.Logic
{
    [TestSuite]
    [RequireGodotRuntime]
    public class CombatLogicTest
    {
        [TestCase]
        public void TakeDamage_ReducesHealth()
        {
            // Setup
            var combat = new UnitCombatController();
            var unit = new Unit();
            var data = new WarYes.Data.UnitData { Health = 100 };
            
            // Start Manual Setup (Bypass Initialize to avoid Weapon spawning/UnitManager dependency)
            SetPrivateField(combat, "_unit", unit);
            SetPrivateField(combat, "_data", data);
            
            // Set Health manually
            SetPrivateProperty(combat, "Health", 100.0f);
            SetPrivateProperty(combat, "MaxHealth", 100.0f);
            SetPrivateProperty(combat, "Morale", 100.0f);
            SetPrivateProperty(combat, "MaxMorale", 100.0f); 
            
            // Set Health manually to ensure clean state
            SetPrivateProperty(combat, "Health", 100.0f);
            
            // Act
            combat.TakeDamage(10.0f, Vector3.Zero);
            
            // Assert
            AssertFloat(combat.Health).IsEqual(90.0f);
            
            // Cleanup
            unit.Free();
            combat.Free();
        }

        [TestCase]
        public void TakeDamage_AppliesSuppression()
        {
            // Setup
            var combat = new UnitCombatController();
            var unit = new Unit();
            var data = new WarYes.Data.UnitData { Health = 100 };
            SetPrivateField(combat, "_unit", unit);
            SetPrivateField(combat, "_data", data);
            
            SetPrivateProperty(combat, "Health", 100.0f);
            SetPrivateProperty(combat, "MaxHealth", 100.0f);
            
            SetPrivateProperty(combat, "Morale", 100.0f);
            SetPrivateProperty(combat, "MaxMorale", 100.0f);
            
            // Act
            // Logic: Morale -= amount * 1.5f;
            combat.TakeDamage(10.0f, Vector3.Zero);
            
            // Assert
            // 100 - (10 * 1.5) = 85
            AssertFloat(combat.Morale).IsEqual(85.0f);
            
            // Cleanup
            unit.Free();
            combat.Free();
        }

        [TestCase]
        public void TakeDamage_Garrisoned_ReducesDamage()
        {
            // Setup
            var combat = new UnitCombatController();
            var unit = new Unit();
            var data = new WarYes.Data.UnitData { Health = 100 };
            SetPrivateField(combat, "_unit", unit);
            SetPrivateField(combat, "_data", data);
            SetPrivateProperty(combat, "Health", 100.0f);
            SetPrivateProperty(combat, "MaxHealth", 100.0f);
            SetPrivateProperty(combat, "Morale", 100.0f);
            SetPrivateProperty(combat, "MaxMorale", 100.0f);
            
            // Mock Garrison State
            // Unit.IsGarrisoned is { get; private set; }
            SetPrivateProperty(unit, "IsGarrisoned", true);
            
            // Act
            // Logic: if (_unit.IsGarrisoned) amount *= 0.5f;
            combat.TakeDamage(10.0f, Vector3.Zero);
            
            // Assert
            // 100 - (10 * 0.5) = 95
            AssertFloat(combat.Health).IsEqual(95.0f);
             
            // Cleanup
            unit.Free();
            combat.Free();
        }

        [TestCase]
        public void Routing_TriggersAtZeroMorale()
        {
             // Setup
            var combat = new UnitCombatController();
            var unit = new Unit();
            var data = new WarYes.Data.UnitData { Health = 100 };
            SetPrivateField(combat, "_unit", unit);
            SetPrivateField(combat, "_data", data);
            
            SetPrivateProperty(combat, "Health", 100.0f);
            SetPrivateProperty(combat, "MaxHealth", 100.0f);
            SetPrivateProperty(combat, "MaxMorale", 100.0f);
            
            SetPrivateProperty(combat, "Morale", 10.0f);
            
            // Act
            // Logic: Morale -= amount; IsRouting => Morale <= 0;
            combat.ApplySuppression(10.0f, Vector3.Zero);
            
            // Assert
            AssertFloat(combat.Morale).IsEqual(0.0f);
            AssertBool(combat.IsRouting).IsTrue();
            
            // Cleanup
            unit.Free();
            combat.Free();
        }

        private void SetPrivateProperty(object obj, string propName, object value)
        {
            var prop = obj.GetType().GetProperty(propName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (prop != null)
                prop.SetValue(obj, value);
        }

        private void SetPrivateField(object obj, string fieldName, object value)
        {
            var field = obj.GetType().GetField(fieldName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (field != null)
                field.SetValue(obj, value);
        }
    }
}
