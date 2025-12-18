using Godot;
using System.Collections.Generic;
using WarYes.Data;
using WarYes.Units.Components;

public partial class TestDeploymentLogic : Node
{
    private bool _testRunning = false;
    private Unit _transport;
    private Unit _passenger;
    private Vector3 _targetPos = new Vector3(100, 0, 0);

    public override void _Ready()
    {
        GD.Print("=== STARTING DEPLOYMENT LOGIC TEST ===");
        CallDeferred(nameof(SetupTest));
    }

    private void SetupTest()
    {
        // 1. Simulate Deployment Manager spawning (Simplified)
        // We need Units with Data.
        // Assuming GameManager and UnitManager are present (Autoloads).
        
        if (GameManager.Instance == null || GameManager.Instance.UnitManager == null)
        {
            GD.PrintErr("FAIL: GameManager or UnitManager missing. Cannot run test.");
            Quit(1);
            return;
        }

        // Spawn Transport
        _transport = GameManager.Instance.UnitManager.SpawnUnit("truck_log", Vector3.Zero, 0); // "truck_log" or valid ID
        if (_transport == null)
        {
             // Try to find a valid transport ID if truck_log fails?
             // Assuming "truck" exists based on file contents seen previously (DeploymentManager checks for truck)
             _transport = GameManager.Instance.UnitManager.SpawnUnit("arm_truck_transport", Vector3.Zero, 0); 
        }

        if (_transport == null)
        {
            GD.PrintErr("FAIL: Could not spawn transport unit.");
            Quit(1);
            return;
        }

        // Spawn Passenger
        _passenger = GameManager.Instance.UnitManager.SpawnUnit("inf_riflemen", Vector3.Zero, 0); // "inf_riflemen" or valid ID
        if (_passenger == null)
        {
             _passenger = GameManager.Instance.UnitManager.SpawnUnit("inf_kommandos", Vector3.Zero, 0);
        }

        if (_passenger == null)
        {
            GD.PrintErr("FAIL: Could not spawn passenger unit.");
            Quit(1);
            return;
        }

        // Mount
        _transport.Mount(_passenger);
        if (!_transport.Passengers.Contains(_passenger))
        {
             GD.PrintErr("FAIL: Mount failed.");
             Quit(1);
             return;
        }

        GD.Print($"Setup: Mounted {_passenger.Name} into {_transport.Name}.");

        // 2. Execute Deployment Logic Sequence (Simulating DeploymentManager.SpawnUnitInstant)
        // mainUnit.MoveTo(moveTarget.Value, Unit.MoveMode.Fast);
        // if (isUnloadAt) mainUnit.UnloadAt(moveTarget.Value, true);
        
        GD.Print($"Command: MoveFast to {_targetPos} then UnloadAt.");
        
        _transport.MoveTo(_targetPos, Unit.MoveMode.Fast);
        _transport.UnloadAt(_targetPos, true); // Queue = true

        _testRunning = true;
    }

    public override void _PhysicsProcess(double delta)
    {
        if (!_testRunning) return;

        // Monitoring
        if (_transport == null) return;
        
        // Fail safe timer? Loop limit?
        if (Time.GetTicksMsec() > 10000) // 10s timeout
        {
            GD.PrintErr("FAIL: Timeout.");
            Quit(1);
        }

        // Check Logic
        // 1. Transport should verify it has command
        // 2. Transport should move.
        // 3. Upon reaching, it should Unload.
        
        float dist = _transport.GlobalPosition.DistanceTo(_targetPos);
        
        // Debug status periodically?
        // GD.Print($"Dist: {dist:F1}, CmdQ: {_transport.CommandQueue.Count}, CurrentCmd: {_transport.CurrentMoveMode}, Passengers: {_transport.Passengers.Count}");
        
        if (dist < 2.0f && _transport.Passengers.Count == 0)
        {
            GD.Print("PASS: Transport reached target and unloaded passengers.");
            Quit(0);
        }
        else if (dist < 2.0f && !_transport.IsMoving && _transport.CommandQueue.Count == 0 && _transport.Passengers.Count > 0)
        {
            // If stopped at target, no queue, passengers inside -> FAIL
             GD.PrintErr("FAIL: Transport stopped at target but passengers still inside!");
             Quit(1);
        }
    }
    
    private void Quit(int code)
    {
        _testRunning = false;
        if (_transport != null) _transport.QueueFree();
        if (_passenger != null) _passenger.QueueFree();
        GetTree().Quit(code);
    }
}
