using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace WarYes.Data
{
    public class DivisionData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("faction_id")]
        public string FactionId { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("playstyle")]
        public string Playstyle { get; set; }

        [JsonPropertyName("slot_costs")]
        public Dictionary<string, int[]> SlotCosts { get; set; }

        [JsonPropertyName("roster")]
        public List<DivisionRosterEntry> Roster { get; set; }
    }

    public class DivisionRosterEntry
    {
        [JsonPropertyName("unit_id")]
        public string UnitId { get; set; }

        [JsonPropertyName("max_cards")]
        public int MaxCards { get; set; }

        [JsonPropertyName("transport_options")]
        public List<string> TransportOptions { get; set; }

        [JsonPropertyName("availability")]
        public Dictionary<string, int> Availability { get; set; }
    }
}
