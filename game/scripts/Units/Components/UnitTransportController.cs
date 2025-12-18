using Godot;
using WarYes.Data;
using System.Collections.Generic;

namespace WarYes.Units.Components
{
    public partial class UnitTransportController : Node3D
    {
        private Unit _unit;
        private UnitData _data;
        
        public int Capacity { get; private set; } = 0;
        public List<Unit> Passengers { get; private set; } = new List<Unit>();
        public Unit TransportUnit { get; set; } // If I am a passenger
        
        public void Initialize(Unit unit, UnitData data)
        {
            _unit = unit;
            _data = data;
            Name = "TransportController";
            
            // Logic moved from Unit.cs
             if (data.Tags.Contains("transport") || data.Tags.Contains("apc") || data.Tags.Contains("ifv") || data.Tags.Contains("truck") || data.Tags.Contains("heli"))
             {
                 Capacity = 1; // Default
             }
             if (data.Tags.Contains("supply")) Capacity = 0; // Override
        }
        
        public void Mount(Unit passenger)
        {
            if (Passengers.Count >= Capacity) return;
            if (passenger == _unit) return;
            
            Passengers.Add(passenger);
            if (passenger.Transport != null) passenger.Transport.TransportUnit = _unit; // Set passenger's transport ref
            
            // Hide passenger
            passenger.Visuals.SetVisualsVisible(false);
            passenger.SetProcess(false);
            passenger.SetPhysicsProcess(false);
            passenger.CollisionLayer = 0;
            passenger.CollisionMask = 0;
            
            GD.Print($"{passenger.Name} mounted into {_unit.Name}");
            // Update UI?
        }
        
    public void UnloadPassengers()
    {
        if (Passengers.Count == 0) return;
        
        GD.Print($"{_unit.Name} unloading {Passengers.Count} passengers.");
        
        foreach(var p in new List<Unit>(Passengers))
        {
            Dismount(p);
        }
        
        // Auto-Return Logic
        if (Passengers.Count == 0)
        {
             // If Truck
             if (_data.Tags.Contains("truck") && !_data.Tags.Contains("apc") && !_data.Tags.Contains("ifv"))
             {
                  _unit.ReturnToBaseAndSell();
             }
        }
    }
    
    public void Dismount(Unit p)
    {
        if (!Passengers.Contains(p)) return;
        
        Passengers.Remove(p);
        if (p.Transport != null) p.Transport.TransportUnit = null;
        
        Vector3 offset = new Vector3((float)GD.RandRange(-2, 2), 0, (float)GD.RandRange(-2, 2)).Normalized() * 3.0f;
        p.GlobalPosition = _unit.GlobalPosition + offset;
        
        p.Visuals.SetVisualsVisible(true);
        p.SetProcess(true);
        p.SetPhysicsProcess(true);
        p.CollisionLayer = 1; 
        p.CollisionMask = 1; 
        
        p.MoveTo(p.GlobalPosition + offset, Unit.MoveMode.Fast);
        GD.Print($"{p.Name} dismounted.");
    }
    }
}
