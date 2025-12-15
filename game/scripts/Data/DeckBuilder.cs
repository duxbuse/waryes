using System.Collections.Generic;
using System.Linq;
using WarYes.Data;

public static class DeckBuilder
{
    public static DeckData BuildDefaultDeck(DivisionData division, Dictionary<string, UnitData> unitLibrary)
    {
        var deck = new DeckData();
        deck.Division = division;
        
        // Simple logic: Take 1 card of each unit in the roster, up to max cards
        // In a real deck builder, the player would choose.
        // Here we just fill it with valid units for testing.

        foreach (var entry in division.Roster)
        {
            if (!unitLibrary.ContainsKey(entry.UnitId))
            {
                Godot.GD.PrintErr($"DeckBuilder: Unit {entry.UnitId} not found in library.");
                continue;
            }

            // Create a card
            var card = new UnitCard();
            card.UnitId = entry.UnitId;
            card.Data = unitLibrary[entry.UnitId];
            
            // Default to first transport option if available
            if (entry.TransportOptions != null && entry.TransportOptions.Count > 0)
            {
                card.TransportId = entry.TransportOptions[0];
            }

            // Default availability (simulating "Trained" or lowest tier)
            // Just picking a reasonable default count
            if (entry.Availability.ContainsKey("trained"))
            {
                card.MaxCount = entry.Availability["trained"];
                card.Veterancy = 1; // 1 = Trained
            }
            else if (entry.Availability.Count > 0)
            {
                // Pick first available
                var kvp = entry.Availability.First();
                card.MaxCount = kvp.Value;
                // Parse veterancy from string key if needed, or default to 0
                card.Veterancy = 0; 
            }
            else 
            {
                card.MaxCount = 5;
                card.Veterancy = 0;
            }
            
            card.AvailableCount = card.MaxCount;
            card.Cost = card.Data.Cost;

            deck.Cards.Add(card);
        }

        return deck;
    }
}
