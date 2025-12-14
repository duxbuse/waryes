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
        
        // Attempt to find the "units" directory relative to the game project
        // Editor: waryes/game/ -> waryes/units/ is "../units"
        string projectPath = ProjectSettings.GlobalizePath("res://");
        // Clean up path if it starts with accessible path
        string unitsPath = Path.GetFullPath(Path.Combine(projectPath, "../units"));
        
        // Fallback for exported builds or different structures could go here
        
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
}
