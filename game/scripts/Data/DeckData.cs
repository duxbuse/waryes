using System.Collections.Generic;

namespace WarYes.Data
{
    public class DeckData
    {
        public DivisionData Division { get; set; }
        public List<UnitCard> Cards { get; set; } = new List<UnitCard>();
    }

    public class UnitCard
    {
        public string UnitId { get; set; }
        public string TransportId { get; set; }
        public int Veterancy { get; set; }
        public int AvailableCount { get; set; } // Current remaining count in match
        public int MaxCount { get; set; } // Total count at start
        public int Cost { get; set; } // Cache cost for easy access

        // Reference to the base data (loaded at runtime)
        public UnitData Data { get; set; }
    }
}
