# Asset Injector
$waryesRoot = "c:\Users\duxbu\OneDrive\Documents\code\waryes"
$jsonFiles = Get-ChildItem -Path $waryesRoot -Recurse -Filter "*.json"

# Icon Mappings
$factions = @{
    "sdf" = "assets/icons/factions/sdf_faction_icon_main.png";
    "vanguard" = "assets/icons/factions/vanguard_faction_icon_main.png"
}

$divisions = @{
    "sdf_212th_heavy_armor" = "assets/icons/divisions/sdf_212th_icon.png";
    "sdf_45th_siege" = "assets/icons/divisions/sdf_45th_icon.png";
    "sdf_101st_airborne" = "assets/icons/divisions/sdf_101st_icon.png";
    "sdf_7th_mechanized" = "assets/icons/divisions/sdf_7th_icon.png";
    "vanguard_2nd_battle" = "assets/icons/factions/vanguard_faction_icon_main.png"; # Fallback
    "vanguard_1st_veteran" = "assets/icons/factions/vanguard_faction_icon_main.png"; # Fallback
    "vanguard_10th_scout" = "assets/icons/factions/vanguard_faction_icon_main.png"; # Fallback
    "vanguard_8th_assault" = "assets/icons/factions/vanguard_faction_icon_main.png"  # Fallback
}

foreach ($file in $jsonFiles) {
    try {
        $json = Get-Content $file.FullName | ConvertFrom-Json
        $updated = $false

        # Faction
        if ($json.PSObject.Properties.Match("divisions") -and $factions.ContainsKey($json.id)) {
            $json.assets.icon = $factions[$json.id]
            $updated = $true
        }
        # Division
        elseif ($json.PSObject.Properties.Match("slot_costs") -and $divisions.ContainsKey($json.id)) {
            $json.icon = $divisions[$json.id]
            $updated = $true
        }
        # Unit (Use Faction Icon as Placeholder)
        elseif ($json.PSObject.Properties.Match("cost")) {
             $faction = if ($file.FullName -match "sdf") { "sdf" } else { "vanguard" }
             $json.icon = $factions[$faction]
             $updated = $true
        }
        # Weapon (Use Faction Icon as Placeholder)
        elseif ($json.PSObject.Properties.Match("penetration")) {
             $faction = if ($file.FullName -match "sdf") { "sdf" } else { "vanguard" }
             $json.icon = $factions[$faction]
             $updated = $true
        }

        if ($updated) {
            $json | ConvertTo-Json -Depth 10 | Set-Content $file.FullName
            Write-Host "Updated $($file.Name)"
        }
    }
    catch {
        Write-Warning "Skipping $($file.Name) - Error: $_"
    }
}
