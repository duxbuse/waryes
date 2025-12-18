using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class TestRefactor : Node
{
    public override void _Ready()
    {
        GD.Print("=== STARTING REFACTOR VERIFICATION ===");
        
        // 1. Check Managers
        if (GameManager.Instance == null) { GD.PrintErr("FAIL: GameManager Instance is null"); return; }
        else GD.Print("PASS: GameManager exists");
        
        if (GameManager.Instance.UnitManager == null) GD.PrintErr("FAIL: UnitManager is null");
        else GD.Print("PASS: UnitManager exists");
        
        if (GameManager.Instance.InputManager == null) GD.PrintErr("FAIL: InputManager is null");
        else GD.Print("PASS: InputManager exists");
        
        if (GameManager.Instance.DeploymentManager == null) GD.PrintErr("FAIL: DeploymentManager is null");
        else GD.Print("PASS: DeploymentManager exists");
        
        // 2. Check Unit Creation & Components
        // Spawn a dummy unit (requires loading data first, which GameManager does)
        // We defer this check slightly to ensure GM init
        CallDeferred(nameof(VerifyUnitComponents));
    }
    
    private void VerifyUnitComponents()
    {
        GD.Print("--- Verifying Unit Components ---");
        
        // Use a known ID or find one
        var library = DataLoader.LoadUnits(); // Or access private? GM has it private.
        // UnitManager has SpawnUnit which takes ID.
        // Let's try "rifleman"
        
        Unit unit = GameManager.Instance.UnitManager.SpawnUnit("rifleman", new Vector3(0, 100, 0), 0);
        if (unit == null)
        {
             GD.PrintErr("FAIL: Could not spawn 'rifleman'. Trying first available...");
             // logic to find valid id
             return;
        }
        
        GD.Print($"Spawned Unit: {unit.Name}");
        
        if (unit.Visuals == null) GD.PrintErr("FAIL: Unit.Visuals is null");
        else GD.Print("PASS: Unit.Visuals component linked");
        
        if (unit.Movement == null) GD.PrintErr("FAIL: Unit.Movement is null");
        else GD.Print("PASS: Unit.Movement component linked");
        
        if (unit.Combat == null) GD.PrintErr("FAIL: Unit.Combat is null");
        else GD.Print("PASS: Unit.Combat component linked");
        
        if (unit.Transport == null) GD.PrintErr("FAIL: Unit.Transport is null");
        else GD.Print("PASS: Unit.Transport component linked");
        
        // Check Tags
        if (unit.Data.Tags != null && unit.Data.Tags.Contains("infantry")) GD.Print("PASS: Unit has inferred 'infantry' tag.");
        else GD.PrintErr("FAIL: Unit missing 'infantry' tag (Data Load issue?)");
        
        // Cleanup
        unit.QueueFree();
        GD.Print("=== VERIFICATION COMPLETE ===");
    }
}
