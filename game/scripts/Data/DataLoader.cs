using Godot;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using WarYes.Data;

public static class DataLoader
{
    private static readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
        IncludeFields = true,
        AllowTrailingCommas = true
    };

    public static Dictionary<string, UnitData> LoadUnits()
    {
        var units = new Dictionary<string, UnitData>();
        string projectPath = ProjectSettings.GlobalizePath("res://");
        string unitsPath = Path.GetFullPath(Path.Combine(projectPath, "../units"));
        
        GD.Print($"DataLoader: Loading units from: {unitsPath}");

        if (!Directory.Exists(unitsPath))
        {
            GD.PrintErr($"DataLoader: Units directory not found at {unitsPath}");
            return units;
        }

        foreach (string file in Directory.EnumerateFiles(unitsPath, "*.json", SearchOption.AllDirectories))
        {
            try
            {
                string json = File.ReadAllText(file);
                UnitData data = JsonSerializer.Deserialize<UnitData>(json, _jsonOptions);
                
                if (string.IsNullOrEmpty(data.Id))
                {
                    data.Id = Path.GetFileNameWithoutExtension(file);
                }

                if (!units.ContainsKey(data.Id))
                {
                    units.Add(data.Id, data);
                    // GD.Print($"Loaded unit: {data.Id}");
                }
                else
                {
                    GD.PrintErr($"DataLoader: Duplicate unit ID found: {data.Id} in {file}");
                }
            }
            catch (System.Exception e)
            {
                GD.PrintErr($"DataLoader: Failed to load unit {file}: {e.Message}");
            }
        }
        
        GD.Print($"DataLoader: Loaded {units.Count} units.");
        return units;
    }

    public static Dictionary<string, DivisionData> LoadDivisions()
    {
        var divisions = new Dictionary<string, DivisionData>();
         string projectPath = ProjectSettings.GlobalizePath("res://");
        string divisionsPath = Path.GetFullPath(Path.Combine(projectPath, "../divisions"));

        GD.Print($"DataLoader: Loading divisions from: {divisionsPath}");

        if (!Directory.Exists(divisionsPath))
        {
            GD.PrintErr($"DataLoader: Divisions directory not found at {divisionsPath}");
            return divisions;
        }

        foreach (string file in Directory.EnumerateFiles(divisionsPath, "*.json", SearchOption.AllDirectories))
        {
            try
            {
                string json = File.ReadAllText(file);
                DivisionData data = JsonSerializer.Deserialize<DivisionData>(json, _jsonOptions);
                
                if (string.IsNullOrEmpty(data.Id))
                {
                    data.Id = Path.GetFileNameWithoutExtension(file);
                }

                if (!divisions.ContainsKey(data.Id))
                {
                    divisions.Add(data.Id, data);
                    // GD.Print($"Loaded division: {data.Id}");
                }
                else
                {
                    GD.PrintErr($"DataLoader: Duplicate division ID found: {data.Id} in {file}");
                }
            }
            catch (System.Exception e)
            {
                GD.PrintErr($"DataLoader: Failed to load division {file}: {e.Message}");
            }
        }
        
        GD.Print($"DataLoader: Loaded {divisions.Count} divisions.");
        return divisions;
    }

    public static Dictionary<string, WeaponStats> LoadWeapons()
    {
        var weapons = new Dictionary<string, WeaponStats>();
        string projectPath = ProjectSettings.GlobalizePath("res://");
        string weaponsPath = Path.GetFullPath(Path.Combine(projectPath, "../weapons"));

        GD.Print($"DataLoader: Loading weapons from: {weaponsPath}");

        if (!Directory.Exists(weaponsPath))
        {
            GD.PrintErr($"DataLoader: Weapons directory not found at {weaponsPath}");
            return weapons;
        }

        foreach (string file in Directory.EnumerateFiles(weaponsPath, "*.json", SearchOption.AllDirectories))
        {
            try
            {
                string json = File.ReadAllText(file);
                WeaponStats data = JsonSerializer.Deserialize<WeaponStats>(json, _jsonOptions);
                
                // Use filename as ID if not specified (though WeaponStats doesn't have ID in JSON usually, we inject it)
                string id = Path.GetFileNameWithoutExtension(file);
                data.Id = id;

                if (!weapons.ContainsKey(id))
                {
                    weapons.Add(id, data);
                }
                else
                {
                    GD.PrintErr($"DataLoader: Duplicate weapon ID found: {id} in {file}");
                }
            }
            catch (System.Exception e)
            {
                GD.PrintErr($"DataLoader: Failed to load weapon {file}: {e.Message}");
            }
        }
        
        GD.Print($"DataLoader: Loaded {weapons.Count} weapons.");
        return weapons;
    }
}
