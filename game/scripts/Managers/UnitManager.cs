using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class UnitManager : Node
{
    public static UnitManager Instance { get; private set; }

    private Dictionary<string, UnitData> _unitLibrary;
    private List<Unit> _activeUnits = new List<Unit>();

    public override void _Ready()
    {
        Instance = this;
        _unitLibrary = DataLoader.LoadUnits();
    }

    public Unit SpawnUnit(string unitId, Vector3 position)
    {
        // Strip "enemy_" prefix for data lookup
        string lookupId = unitId.Replace("enemy_", "");
        
        if (!_unitLibrary.ContainsKey(lookupId))
        {
            GD.PrintErr($"UnitManager: Unknown unit ID {lookupId} (Original: {unitId})");
            return null;
        }

        UnitData data = _unitLibrary[lookupId];
        
        var unit = new Unit();
        unit.Name = $"{unitId}_{_activeUnits.Count}";
        unit.Position = position;
        
        // Add to scene BEFORE Initialize to ensure _Ready runs if needed, or after?
        // Actually, AddChild triggers _Ready.
        Node container = GetNodeOrNull("../Units") ?? GetParent();
        if (container == null)
        {
             GD.PrintErr("UnitManager: Could not find container!");
             return null;
        }
        
        container.AddChild(unit);
        GD.Print($"UnitManager: Added {unit.Name} to {container.Name}");
        
        unit.Initialize(data); // Visuals created here now
        
        _activeUnits.Add(unit);
        return unit;
    }
    
    public List<Unit> GetActiveUnits()
    {
        return _activeUnits;
    }
}
