using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class UnitManager : Node
{
    public static UnitManager Instance { get; private set; }

    private Dictionary<string, UnitData> _unitLibrary;
    private Dictionary<string, WeaponStats> _weaponLibrary;
    private List<Unit> _activeUnits = new List<Unit>();

    public override void _Ready()
    {
        Instance = this;
        _unitLibrary = DataLoader.LoadUnits();
        _weaponLibrary = DataLoader.LoadWeapons();
    }

    public Unit SpawnUnit(string unitId, Vector3 position, int veterancyLevel = 0)
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
        
        unit.Initialize(data, veterancyLevel); // Visuals created here now
        
        _activeUnits.Add(unit);
        return unit;
    }
    
    public WeaponStats GetWeaponStats(string weaponId)
    {
        if (_weaponLibrary != null && _weaponLibrary.ContainsKey(weaponId))
        {
            return _weaponLibrary[weaponId];
        }
        // Fallback or error
        GD.PrintErr($"UnitManager: Weapon stats not found for {weaponId}");
        return null; // Handle null in caller
    }

    public List<Unit> GetActiveUnits()
    {
        // Cleanup nulls or queued for deletion
        for (int i = _activeUnits.Count - 1; i >= 0; i--)
        {
            if (_activeUnits[i] == null || !IsInstanceValid(_activeUnits[i]) || _activeUnits[i].IsQueuedForDeletion())
            {
                _activeUnits.RemoveAt(i);
            }
        }
        return _activeUnits;
    }
}
