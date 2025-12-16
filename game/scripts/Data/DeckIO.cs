using Godot;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using WarYes.Data;

public static class DeckIO
{
    private static readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
    {
        WriteIndented = true,
        IncludeFields = true
    };

    private static string DeckDirectory => ProjectSettings.GlobalizePath("user://decks/");

    public static void SaveDeck(DeckData deck, string deckName)
    {
        if (!Directory.Exists(DeckDirectory))
        {
            Directory.CreateDirectory(DeckDirectory);
        }

        // Clean filename
        foreach(var c in Path.GetInvalidFileNameChars()) 
        {
            deckName = deckName.Replace(c, '_');
        }

        string path = Path.Combine(DeckDirectory, deckName + ".json");
        
        try 
        {
            string json = JsonSerializer.Serialize(deck, _jsonOptions);
            File.WriteAllText(path, json);
            GD.Print($"DeckIO: Saved deck '{deckName}' to {path}");
        }
        catch (System.Exception e)
        {
            GD.PrintErr($"DeckIO: Failed to save deck {deckName}: {e.Message}");
        }
    }

    public static DeckData LoadDeck(string deckName)
    {
        // deckName can be full path or just name
        string path = deckName;
        if (!Path.IsPathRooted(deckName))
        {
             if (!deckName.EndsWith(".json")) deckName += ".json";
             path = Path.Combine(DeckDirectory, deckName);
        }

        if (!File.Exists(path))
        {
            GD.PrintErr($"DeckIO: Deck file not found: {path}");
            return null;
        }

        try
        {
            string json = File.ReadAllText(path);
            var deck = JsonSerializer.Deserialize<DeckData>(json, _jsonOptions);
            
            // Re-link Data references after loading (as they aren't serialized strictly)
            // We need the Library for this.
            // GameGlobal should handle the re-linking or the caller. 
            // The DeckData contains string IDs. 
            
            return deck;
        }
        catch (System.Exception e)
        {
            GD.PrintErr($"DeckIO: Failed to load deck {path}: {e.Message}");
            return null;
        }
    }

    public static List<string> GetSavedDeckNames()
    {
        var names = new List<string>();
        if (!Directory.Exists(DeckDirectory)) return names;

        foreach (string file in Directory.EnumerateFiles(DeckDirectory, "*.json"))
        {
            names.Add(Path.GetFileNameWithoutExtension(file));
        }
        return names;
    }
}
