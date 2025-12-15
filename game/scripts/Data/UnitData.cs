using System.Text.Json.Serialization;

namespace WarYes.Data
{
    public struct UnitData
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public int Cost { get; set; }
        public string Icon { get; set; }
        public int Health { get; set; }

        public SpeedData Speed { get; set; }

        public ArmorData Armor { get; set; }

        public int? Fuel { get; set; }

        public AutonomyData? Autonomy { get; set; }

        public string Optics { get; set; }
        public string Stealth { get; set; }

        [JsonPropertyName("forward_deploy")]
        public int ForwardDeploy { get; set; }

        public WeaponEntry[] Weapons { get; set; }
    }

    public struct SpeedData
    {
        public int Road { get; set; }
        
        [JsonPropertyName("off_road")]
        public int OffRoad { get; set; }
        
        [JsonPropertyName("rotation_speed")]
        public float? RotationSpeed { get; set; }
    }

    public struct ArmorData
    {
        public int Front { get; set; }
        public int Side { get; set; }
        public int Rear { get; set; }
        public int Top { get; set; }
    }

    public struct AutonomyData
    {
        public int Road { get; set; }
        
        [JsonPropertyName("off_road")]
        public int OffRoad { get; set; }
    }

    public struct WeaponEntry
    {
        [JsonPropertyName("weapon_id")]
        public string WeaponId { get; set; }
        
        public int Count { get; set; }
        
        [JsonPropertyName("max_ammo")]
        public int MaxAmmo { get; set; }
    }
}
