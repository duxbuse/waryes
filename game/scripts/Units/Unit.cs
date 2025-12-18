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
        public enum Type { Move, AttackUnit, UnloadAt, Sell, Garrison }
        public Type CommandType;
        public Vector3 TargetPosition;
        public Unit TargetUnit;
        public GarrisonableBuilding TargetBuilding;
        public MoveMode MoveMode;
        public Vector3? FinalFacing;
    }
    private Queue<Command> _commandQueue = new Queue<Command>();
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
        
        IsGarrisoned = false;
        Visuals?.SetVisualsVisible(true);
        
        // Find exit position
        Vector3 exitPos = CurrentBuilding.GetExitPosition(GlobalPosition + Vector3.Forward * 5f);
        GlobalPosition = exitPos;
        
        CurrentBuilding = null;
    }
    
    public void Garrison(GarrisonableBuilding building)
    {
         var cmd = new Command { CommandType = Command.Type.Garrison, TargetBuilding = building, MoveMode = MoveMode.Fast };
         _commandQueue.Clear();
         _currentCommand = cmd;
         Movement?.MoveTo(building.GlobalPosition);
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
    public void MoveTo(Vector3 position, MoveMode mode = MoveMode.Normal)
    {
         var cmd = new Command { CommandType = Command.Type.Move, TargetPosition = position, MoveMode = mode };
         _commandQueue.Clear();
         _currentCommand = cmd;
         if (Movement != null) Movement.MoveTo(position); 
    }
    
    public void Attack(Unit target)
    {
         var cmd = new Command { CommandType = Command.Type.AttackUnit, TargetUnit = target };
         _commandQueue.Clear();
         _currentCommand = cmd;
         if (Movement != null) Movement.MoveTo(target.GlobalPosition);
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
    }    }
}
