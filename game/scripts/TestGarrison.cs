using Godot;
using System.Collections.Generic;

public partial class TestGarrison : Node
{
    public override void _Ready()
    {
        GD.Print("TEST: Starting Garrison Verification...");
        
        // 1. Setup Building
        var building = new GarrisonableBuilding();
        building.Name = "Test_Church";
        building.IsHighGround = true;
        building.Capacity = 3;
        // Mock Mesh for visual logic
        var mesh = new MeshInstance3D();
        mesh.Name = "Mesh";
        building.AddChild(mesh);
        AddChild(building);
        
        // 2. Setup Units
        // We can't easily spawn via UnitManager without data, so we manually instantiate Unit.
        // Need to set unit.Data to something valid enough.
        
        var u1 = CreateTestUnit("infantry_1", "Player");
        var u2 = CreateTestUnit("infantry_2", "Player");
        var enemy1 = CreateTestUnit("enemy_1", "Enemy");
        
        AddChild(u1);
        AddChild(u2);
        AddChild(enemy1);
        
        // 3. Test Entry
        GD.Print("TEST: Attempting Entry...");
        bool success = building.TryEnter(u1);
        GD.Print($"TEST: Unit 1 Entry Success: {success} (Exp: True)");
        
        bool success2 = building.TryEnter(u2);
        GD.Print($"TEST: Unit 2 Entry Success: {success2} (Exp: True)");
        
        // 4. Test Visuals (Manually triggering update if needed, but TryEnter calls it)
        // Check log for "Test_Church" turning colors.
        
        // 5. Test Damage Reduction
        GD.Print("TEST: Testing Damage Reduction...");
        u1.TakeDamage(10.0f, Vector3.Zero); // Should take 5.0
        // We can't easily assert private vars in this script without reflection, 
        // but Unit.cs prints "Health" on damage. We rely on console logs.
        
        // 6. Test Enemy Entry (Co-occupation)
        GD.Print("TEST: Enemy Attempting Entry...");
        bool successEnemy = building.TryEnter(enemy1);
        GD.Print($"TEST: Enemy Entry Success: {successEnemy} (Exp: True)");
        
        // Visuals should be Contested (Check logs/visuals if running)
        
        // 7. Test Distributed Damage from Building Hit
        GD.Print("TEST: Shooting Building...");
        building.TakeFire(30.0f, null);
        // Should split 30 / 3 units = 10 each.
        // Then reduced by 50% = 5 each.
        // Check logs for 3 units taking damage.
        
        // 8. Test High Ground LoS
        // Hard to verify without physics query, but we can check property.
        // Logic verification done via code review.
        
        // 9. Exit
        GD.Print("TEST: Exiting...");
        building.Exit(u1);
        GD.Print($"TEST: Occupants after exit: {building.Occupants.Count} (Exp: 2)");
        
        QueueFree(); // Cleanup
    }
    
    private Unit CreateTestUnit(string name, string team)
    {
        var u = new Unit();
        u.Name = name;
        u.Team = team;
        // Need to bypass Initialize which depends on Data
        // Reflection to set Data or just rely on basics?
        // Unit.cs uses Data a lot. Maybe mock Data?
        // UnitData is a class.
        u.Data = new WarYes.Data.UnitData();
        u.Data.Id = name;
        // u.Initialize(u.Data); // Calls visuals etc. might fail without resources.
        // We just toggle Garrisoned flag manually via TryEnter code path.
        return u;
    }
}
