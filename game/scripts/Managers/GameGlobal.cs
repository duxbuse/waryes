using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class GameGlobal : Node
{
    public static GameGlobal Instance { get; private set; }

    public Dictionary<string, UnitData> UnitLibrary { get; private set; }
    public Dictionary<string, DivisionData> Divisions { get; private set; }
    
    // The deck selected for the upcoming battle
    public DeckData SelectedDeck { get; set; }

    public override void _Ready()
    {
        Instance = this;
        GD.Print("GameGlobal: Initializing...");
        
        // Load Data Once
        UnitLibrary = DataLoader.LoadUnits();
        Divisions = DataLoader.LoadDivisions();
        
        GD.Print($"GameGlobal: Initialized with {UnitLibrary.Count} units and {Divisions.Count} divisions.");
    }

    public void ChangeScene(string scenePath)
    {
        GD.Print($"GameGlobal: Changing scene to {scenePath}");
        GetTree().ChangeSceneToFile(scenePath);
    }
    
    /// <summary>
    /// Helper to re-link unit data to a loaded deck's cards
    /// </summary>
    public void HydrateDeck(DeckData deck)
    {
        if (deck == null) return;
        
        foreach(var card in deck.Cards)
        {
            if (UnitLibrary.ContainsKey(card.UnitId))
            {
                card.Data = UnitLibrary[card.UnitId];
            }
            else
            {
                GD.PrintErr($"GameGlobal: Could not find unit {card.UnitId} for loaded deck.");
            }
        }
        
        // Also hydrate Division if ID is present (DeckData might need DivisionId stored if not full object)
        // For now, we assume DeckData serialized the division object or we just don't strictly need it fully reactive yet.
        // Actually DeckData has 'DivisionData Division'. JsonSerializer might handle it if it's complex, 
        // but typically we'd want to just store ID and reload.
        // For prototype, let's assume specific hydration isn't critical unless we lose data.
    }
}
