using System.Text.Json.Serialization;

namespace WarYes.Data
{
    public class WeaponStats
    {
        public string Id { get; set; } // Populated manually from filename

        public string Name { get; set; }
        public string Icon { get; set; }

        public WeaponRange Range { get; set; }
        public int Penetration { get; set; }
        public string Damage { get; set; } // e.g., "1 HE"
        public int Suppression { get; set; }
        
        [JsonPropertyName("rate_of_fire")]
        public int RateOfFire { get; set; } // RPM

        public WeaponAccuracy Accuracy { get; set; }

        [JsonPropertyName("aim_time")]
        public float AimTime { get; set; }

        [JsonPropertyName("reload_time")]
        public float ReloadTime { get; set; }

        [JsonPropertyName("salvo_length")]
        public int SalvoLength { get; set; }

        [JsonPropertyName("supply_cost")]
        public int SupplyCost { get; set; }

        [JsonPropertyName("is_guided")]
        public bool IsGuided { get; set; }

        [JsonPropertyName("projectile_speed")]
        public float ProjectileSpeed { get; set; } // Speed of the projectile

        [JsonPropertyName("turn_speed")]
        public float TurnSpeed { get; set; } // Degrees per second
    }

    public class WeaponRange
    {
        public int Ground { get; set; }
        public int? Air { get; set; }
    }

    public class WeaponAccuracy
    {
        public int Static { get; set; }
        public int Moving { get; set; }
    }
}
