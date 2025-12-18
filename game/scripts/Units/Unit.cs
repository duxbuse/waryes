using Godot;
using WarYes.Data;
using WarYes.UI;
using WarYes.Units.Components;
using System.Collections.Generic;

public partial class Unit : CharacterBody3D
{
    // Components
    public UnitVisualController Visuals { get; private set; }
    public UnitMovementController Movement { get; private set; }
    public UnitCombatController Combat { get; private set; }
    public UnitTransportController Transport { get; private set; }
    
    // Data
    public UnitData Data;
    public string Team { get; set; } = "Player";
    
    // State wrappers
    public float Health => Combat != null ? Combat.Health : 0;
    public bool IsMoving => Movement != null ? Movement.IsMoving : false;
    public bool IsFrozen { get; private set; } = false;
    public bool IsGarrisoned { get; private set; } = false;

    public GarrisonableBuilding CurrentBuilding { get; private set; }
    public bool IsReturnFireOnly { get; set; } = false;
    public bool IsRouting => Combat != null && Combat.IsRouting;
    
    public float Morale => Combat != null ? Combat.Morale : 100.0f;
    public float MaxMorale => Combat != null ? Combat.MaxMorale : 100.0f;
    
    public int Rank => Combat != null ? Combat.Rank : 0;
    public int CurrentExperience => Combat != null ? Combat.CurrentExperience : 0;
    public List<Unit> Passengers => Transport != null ? Transport.Passengers : new List<Unit>();
    public Unit TransportUnit 
    { 
        get => Transport != null ? Transport.TransportUnit : null; 
        set { if (Transport != null) Transport.TransportUnit = value; }
    }
    public int TransportCapacity => Transport != null ? Transport.Capacity : 0;

    // Command Queue
    public enum MoveMode { Normal, Reverse, Fast, Hunt, Unload }
    public class Command
    {
        public enum Type { Move, AttackUnit, UnloadAt, Sell, Garrison, Mount, TransportPickUp }
        public Type CommandType;
        public Vector3 TargetPosition;
        public Unit TargetUnit;
        public GarrisonableBuilding TargetBuilding;
        public MoveMode MoveMode;
        public Vector3? FinalFacing;
    }
    private Queue<Command> _commandQueue = new Queue<Command>();
    public Queue<Command> CommandQueue => _commandQueue;
    private Command _currentCommand;
    public MoveMode CurrentMoveMode => _currentCommand != null ? _currentCommand.MoveMode : MoveMode.Normal;

    public override void _Ready()
    {
        // Components will be added in Initialize
    }

    public void Initialize(UnitData data, int rank = 0)
    {
        Data = data;
        
        // Team Logic
        if (Name.ToString().ToLower().Contains("enemy") || (Data.Id.ToLower().Contains("enemy"))) Team = "Enemy";
        else Team = "Player";
        
        // 1. Visuals
        Visuals = new UnitVisualController();
        AddChild(Visuals);
        Visuals.Initialize(this, Data); // Pass self
        
        // 2. Movement
        Movement = new UnitMovementController();
        AddChild(Movement);
        Movement.Initialize(this, Data);
        
        // 3. Combat
        Combat = new UnitCombatController();
        AddChild(Combat);
        Combat.Initialize(this, Data, rank);
        
        // 4. Transport
        Transport = new UnitTransportController();
        AddChild(Transport);
        Transport.Initialize(this, Data);
        
        // Auto-Freeze if Setup
        if (GameManager.Instance != null && GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup)
        {
            SetFrozen(true);
        }
    }
    
    // Facades for interactions
    public bool ElementIsEnemy => Team == "Enemy"; // Helper for Visuals
    public bool IsCommander => Data.IsCommander;
    
    public void SetSelected(bool selected)
    {
        Visuals?.SetSelected(selected);
    }
    
    public void CheckAmmoStatus(bool anyEmpty)
    {
        Visuals?.CheckAmmoStatus(anyEmpty);
    }
    
    public void TriggerSuppressionImpact(float amount, Vector3 sourcePos)
    {
        Combat?.ApplySuppression(amount, sourcePos);
    }
    
    public void TakeDamage(float amount, Vector3 sourcePos)
    {
        Combat?.TakeDamage(amount, sourcePos);
    }
    
    public void TakeDamage(float amount, Unit attacker)
    {
        if (attacker != null) TakeDamage(amount, attacker.GlobalPosition);
        else TakeDamage(amount, GlobalPosition);
    }

    public float GetMaxRange() => Combat != null ? Combat.GetMaxRange() : 0;
    
    public void EnterBuilding(GarrisonableBuilding building)
    {
        IsGarrisoned = true;
        CurrentBuilding = building;
        Visuals?.SetVisualsVisible(false); // Hide
        GlobalPosition = building.GlobalPosition; // Snap to center (or hide)
        Movement?.Stop();
    }
    
    public void ExitBuilding()
    {
        if (CurrentBuilding == null) return;
        
        var building = CurrentBuilding;  // Store reference before clearing
        CurrentBuilding = null;  // Clear before exiting to prevent recursion
        IsGarrisoned = false;
        
        // Find exit position on closest side of building
        Vector3 exitPos = building.GetExitPosition(GlobalPosition);
        GlobalPosition = exitPos;
        
        // Restore visibility and physics state (same as transport dismount)
        Visuals?.SetVisualsVisible(true);
        SetProcess(true);
        SetPhysicsProcess(true);
        CollisionLayer = 1;
        CollisionMask = 1;
        
        GD.Print($"{Name} exited building at {exitPos}, visible={Visuals != null}");
    }
    
    public void Garrison(GarrisonableBuilding building, bool queue = false)
    {
         var cmd = new Command { CommandType = Command.Type.Garrison, TargetBuilding = building, MoveMode = MoveMode.Fast };
         if (queue)
         {
             _commandQueue.Enqueue(cmd);
         }
         else
         {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd); // Need to make sure ExecuteCommand handles Garrison (it doesn't seem to yet in the previous view, let me check)
         }
    }
    
    public void Die()
    {
        GD.Print($"{Name} destroyed!");
        QueueFree();
    }
    
    public void Mount(Unit passenger) => Transport?.Mount(passenger);
    public void UnloadPassengers() => Transport?.UnloadPassengers();
    
    public void ReturnToBaseAndSell()
    {
         if (UnitManager.Instance == null) return;
         Vector3? spawnPos = UnitManager.Instance.GetNearestReinforcePoint(GlobalPosition, Team);
         if (spawnPos.HasValue)
         {
              var cmd = new Command { CommandType = Command.Type.Sell, TargetPosition = spawnPos.Value, MoveMode = MoveMode.Fast };
              _commandQueue.Clear();
              _currentCommand = cmd;
              ExecuteCommand(cmd);
         }
    }
    
    public void UnloadAt(Vector3 pos, bool queue)
    {
         var cmd = new Command { CommandType = Command.Type.UnloadAt, TargetPosition = pos, MoveMode = MoveMode.Fast };
         if (queue) _commandQueue.Enqueue(cmd);
         else 
         {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd);
         }
    }
    
    public void SetFrozen(bool frozen)
    {
        IsFrozen = frozen;
        if (frozen && Movement != null) Movement.Stop();
    }
    
    // Command Interface
    public void MoveTo(Vector3 position, MoveMode mode = MoveMode.Normal, bool queue = false)
    {
         var cmd = new Command { CommandType = Command.Type.Move, TargetPosition = position, MoveMode = mode };
         if (queue)
         {
             _commandQueue.Enqueue(cmd);
         }
         else
         {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd);
         } 
    }
    
    public void Attack(Unit target, bool queue = false)
    {
         var cmd = new Command { CommandType = Command.Type.AttackUnit, TargetUnit = target };
         if (queue)
         {
             _commandQueue.Enqueue(cmd);
         }
         else
         {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd);
         }
    }
    
    public override void _PhysicsProcess(double delta)
    {
        if (IsFrozen) return;
        
        // Command Processing Logic (The "Brain")
        if (_currentCommand != null)
        {
             ProcessCurrentCommand();
        }
        else if (_commandQueue.Count > 0)
        {
             _currentCommand = _commandQueue.Dequeue();
             ExecuteCommand(_currentCommand);
        }
    }
    
    private void ExecuteCommand(Command cmd)
    {
        if (cmd.CommandType == Command.Type.Move)
        {
            Movement.MoveTo(cmd.TargetPosition); 
        }
        else if (cmd.CommandType == Command.Type.AttackUnit)
        {
            Movement.MoveTo(cmd.TargetUnit.GlobalPosition);
        }
        else if (cmd.CommandType == Command.Type.UnloadAt)
        {
             Movement.MoveTo(cmd.TargetPosition);
        }
        else if (cmd.CommandType == Command.Type.Sell)
        {
             Movement.MoveTo(cmd.TargetPosition);
        }
        else if (cmd.CommandType == Command.Type.Garrison)
        {
             Movement.MoveTo(cmd.TargetBuilding.GlobalPosition);
        }
        else if (cmd.CommandType == Command.Type.Mount)
        {
             Movement.MoveTo(cmd.TargetUnit.GlobalPosition);
        }
        else if (cmd.CommandType == Command.Type.TransportPickUp)
        {
             Movement.MoveTo(cmd.TargetUnit.GlobalPosition);
        }
    }
    
    private void ProcessCurrentCommand()
    {
         if (_currentCommand.CommandType == Command.Type.Move)
         {
             if (Movement.IsNavigationFinished())
             {
                 _currentCommand = null; 
             }
         }
         else if (_currentCommand.CommandType == Command.Type.AttackUnit)
         {
             if (!IsInstanceValid(_currentCommand.TargetUnit))
             {
                 _currentCommand = null;
                 Movement.Stop();
             }
             else
             {
                 Movement.MoveTo(_currentCommand.TargetUnit.GlobalPosition);
             }
         }
         else if (_currentCommand.CommandType == Command.Type.UnloadAt)
         {
             if (Movement.IsNavigationFinished())
             {
                 UnloadPassengers(); // Actually Unload
                 _currentCommand = null;
             }
         }
         else if (_currentCommand.CommandType == Command.Type.Sell)
         {
             if (Movement.IsNavigationFinished())
             {
                 // Check if close enough?
                 if (GlobalPosition.DistanceTo(_currentCommand.TargetPosition) < 5.0f)
                 {
                      // Perform Sell interface
                      if (GameManager.Instance != null && GameManager.Instance.EconomyManager != null)
                      { // Stub for Sell logic
                          GameManager.Instance.EconomyManager.AddCredits(Data.Cost); 
                          Die();
                      }
                 }
                 _currentCommand = null;
             }
         }
    else if (_currentCommand.CommandType == Command.Type.Garrison)
    {
         if (Movement.IsNavigationFinished())
         {
             var b = _currentCommand.TargetBuilding;
             if (IsInstanceValid(b) && GlobalPosition.DistanceTo(b.GlobalPosition) < 15.0f) // 15m radius
             {
                 if (b.TryEnter(this))
                 {
                     _currentCommand = null;
                 }
                 else
                 {
                     GD.Print("Garrison failed (Full?)");
                     _currentCommand = null;
                 }
             }
             else
             {
                 _currentCommand = null;
             }
         }
    }    
    else if (_currentCommand.CommandType == Command.Type.Mount)
    {
         // Infantry Logic: Move to Transport and Mount
         var t = _currentCommand.TargetUnit;
         if (!IsInstanceValid(t) || t.IsQueuedForDeletion())
         {
              _currentCommand = null;
              Movement.Stop(); 
              return;
         }
         
         Movement.MoveTo(t.GlobalPosition); // Update target pos dynamically
         
         if (GlobalPosition.DistanceTo(t.GlobalPosition) < 8.0f) 
         {
              t.Mount(this);
              // If successful, we are hidden/disabled, command irrelevant
              _currentCommand = null; 
         }
    }
    else if (_currentCommand.CommandType == Command.Type.TransportPickUp)
    {
         // Transport Logic: Move to Infantry
         var p = _currentCommand.TargetUnit;
         // Check validity
         if (!IsInstanceValid(p) || p.IsQueuedForDeletion() || p.TransportUnit != null)
         {
              _currentCommand = null; // Passenger mounted or died
              Movement.Stop();
              return;
         }
         
         Movement.MoveTo(p.GlobalPosition);
         
         // If close, we wait for them to mount (they should have a Mount command)
         // Or we trigger it if we are super close?
         if (GlobalPosition.DistanceTo(p.GlobalPosition) < 8.0f)
         {
             // We can force mount if we are the active mover
             Mount(p);
             if (Passengers.Contains(p)) _currentCommand = null; 
         }
    }
    }
    
    public void MountTransport(Unit transport, bool queue = false)
    {
         var cmd = new Command { CommandType = Command.Type.Mount, TargetUnit = transport, MoveMode = MoveMode.Fast };
         if (queue) _commandQueue.Enqueue(cmd);
         else 
         {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd);
         }
    }
    
    public void TransportPickUp(Unit passenger, bool queue = false)
    {
         var cmd = new Command { CommandType = Command.Type.TransportPickUp, TargetUnit = passenger, MoveMode = MoveMode.Fast };
         // Transports usually just go do it immediately, but queueing supported
         if (queue) _commandQueue.Enqueue(cmd);
         else 
         {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd);
         }
    }
}
