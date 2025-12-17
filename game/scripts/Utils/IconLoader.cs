using Godot;
using System.IO;

namespace WarYes.Utils
{
    public static class IconLoader
    {
        public static Texture2D LoadUnitIcon(WarYes.Data.UnitData data)
        {
            // 1. Try explicit path from Data (JSON)
            if (!string.IsNullOrEmpty(data.Icon))
            {
                var tex = LoadPathWithExtensions(data.Icon);
                if (tex != null) return tex;
            }

            // 2. Try inferred path based on ID (res://assets/icons/units/{faction}/{unitId})
            // Detect faction from ID prefix
            string faction = "vanguard"; // Default
            if (data.Id.ToLower().StartsWith("sdf")) faction = "sdf";
            // If ID contains vanguard, use vanguard (redundant but safe)
            if (data.Id.ToLower().Contains("vanguard")) faction = "vanguard";

            string inferredPath = $"res://assets/icons/units/{faction}/{data.Id}";
            var inferredTex = LoadPathWithExtensions(inferredPath);
            if (inferredTex != null) return inferredTex;

            // 3. Fallback to Category Icon
            return LoadCategoryIcon(data.Category);
        }

        public static Texture2D LoadUnitIcon(string unitId, string category) 
        {
             // Overload for cases where we don't have full UnitData object but have ID/Category
             // Construct logical path from ID
             string faction = "vanguard";
             if (unitId.ToLower().StartsWith("sdf")) faction = "sdf";
             
             string inferredPath = $"res://assets/icons/units/{faction}/{unitId}";
             var tex = LoadPathWithExtensions(inferredPath);
             if (tex != null) return tex;
             
             return LoadCategoryIcon(category);
        }

        private static Texture2D LoadPathWithExtensions(string basePath)
        {
            if (!basePath.StartsWith("res://")) basePath = "res://" + basePath;
            
            // Remove extension if present to try others
            string extension = Path.GetExtension(basePath);
            if (!string.IsNullOrEmpty(extension))
            {
                basePath = basePath.Substring(0, basePath.Length - extension.Length);
            }

            string[] extensions = { ".png", ".jpg", ".jpeg" };
            foreach (var ext in extensions)
            {
                string path = basePath + ext;
                if (ResourceLoader.Exists(path))
                {
                    Texture2D tex = null;
                    try 
                    {
                        tex = GD.Load<Texture2D>(path);
                    }
                    catch (System.Exception ex) 
                    { 
                        GD.PrintErr($"IconLoader: Exception loading resource '{path}': {ex.Message}");
                    }
                    
                    if (tex == null) 
                    {
                        // Fallback: Manually load image from filesystem
                        var img = new Image();
                        var globalPath = ProjectSettings.GlobalizePath(path);
                        var err = img.Load(globalPath);
                        if (err == Error.Ok)
                        {
                            tex = ImageTexture.CreateFromImage(img);
                            GD.PrintRich($"[color=yellow]IconLoader: Loaded '{path}' via fallback (Image load). .import might be missing/corrupt.[/color]");
                        }
                        else
                        {
                             GD.PrintErr($"IconLoader: Fallback load failed for '{globalPath}'. Error: {err}");
                        }
                    }

                    if (tex != null) return tex;
                }
            }
            return null;
        }

        public static Texture2D LoadCategoryIcon(string category)
        {
             if (string.IsNullOrEmpty(category)) return LoadCategoryIcon("LOG"); // Default

             string filename = category.ToUpper() switch 
             {
                 "INF" => "infantry.svg",
                 "TRUCK" => "truck.svg",
                 "APC" => "apc.png",
                 "IFV" => "ifv.svg",
                 "LOG" => "support.svg",
                 "TNK" => "tank.svg",
                 "REC" => "recon.svg",
                 "AA" => "anti_air.svg",
                 "ART" => "artillery.svg",
                 "HEL" => "vtol.svg",
                 "AIR" => "vtol.svg",
                 _ => "support.svg"
             };

             string path = $"res://assets/icons/categories/{filename}";
             if (ResourceLoader.Exists(path)) return GD.Load<Texture2D>(path);
             
             return null;
        }

        public static Texture2D LoadVeterancyIcon(int level)
        {
             // Map level to filename
             // 0 -> vet0.svg, 1 -> vet1.svg, etc.
             // Cap at 3 or handle special?
             if (level < 0) return null;
             if (level > 3) level = 3; // Cap

             string filename = $"vet{level}.svg";
             string path = $"res://assets/icons/veterancy/{filename}";
             
             if (ResourceLoader.Exists(path)) return GD.Load<Texture2D>(path);
             return null;
        }
        public static Texture2D LoadWeaponIcon(string weaponId)
        {
             // 1. Try faction-specific path
             // Detect faction from ID prefix
             string faction = "vanguard";
             if (weaponId.ToLower().StartsWith("sdf")) faction = "sdf";
             
             string path = $"res://assets/icons/weapons/{faction}/{weaponId}.svg";
             
             if (ResourceLoader.Exists(path)) return GD.Load<Texture2D>(path);
             
             // 2. Fallback to generic if needed (though we generated all specifics)
             // ... could load _base/base_cannon.svg etc if we had logic, but we generated specifics.
             
             return null;
        }
    }
}
