# Veterancy Applier
$waryesRoot = "c:\Users\duxbu\OneDrive\Documents\code\waryes"
$divisionFiles = Get-ChildItem -Path "$waryesRoot\divisions" -Recurse -Filter "*.json"

# Default Curves
$curves = @{
    "militia" = @{ rookie = 24; trained = 18; veteran = 0; elite = 0; legend = 0 };
    "line"    = @{ rookie = 16; trained = 12; veteran = 8; elite = 0; legend = 0 };
    "shock"   = @{ rookie = 0; trained = 8; veteran = 6; elite = 4; legend = 0 };
    "command" = @{ rookie = 0; trained = 4; veteran = 3; elite = 2; legend = 0 };
    "tank_med"= @{ rookie = 8; trained = 6; veteran = 4; elite = 3; legend = 0 };
    "tank_hvy"= @{ rookie = 0; trained = 3; veteran = 2; elite = 1; legend = 0 };
    "air"     = @{ rookie = 3; trained = 2; veteran = 1; elite = 0; legend = 0 };
    "recon"   = @{ rookie = 6; trained = 4; veteran = 3; elite = 2; legend = 0 };
    "arty"    = @{ rookie = 4; trained = 3; veteran = 2; elite = 0; legend = 0 };
    "log"     = @{ rookie = 6; trained = 4; veteran = 0; elite = 0; legend = 0 };
}

function Get-Curve ($unitId) {
    if ($unitId -match "militia|conscript") { return $curves["militia"] }
    if ($unitId -match "shock|storm|terminator|exo_armor|vanguard_vet") { return $curves["shock"] }
    if ($unitId -match "command") { return $curves["command"] }
    if ($unitId -match "bastion_mbt_battle|bastion_mbt_siege|hunter_tank") { return $curves["tank_med"] }
    if ($unitId -match "bastion_mbt_hunter|bastion_mbt_rotary|behemoth|fortress_tank|venerable") { return $curves["tank_hvy"] }
    if ($unitId -match "fighter|bomber|gunship|falcon|nova|skyfortress|star_fighter|raven|talon") { return $curves["air"] }
    if ($unitId -match "recon|scout|sniper|outrider|speeder") { return $curves["recon"] }
    if ($unitId -match "arty|mortar|cannon|basilisk|whirlwind|barrage") { return $curves["arty"] }
    if ($unitId -match "truck|apc|supply") { return $curves["log"] }
    
    return $curves["line"] # Default
}

foreach ($file in $divisionFiles) {
    try {
        $json = Get-Content $file.FullName | ConvertFrom-Json
        
        foreach ($entry in $json.roster) {
            # Only apply if missing
            if (-not $entry.availability) {
                $entry | Add-Member -NotePropertyName "availability" -NotePropertyValue (Get-Curve $entry.unit_id)
            }
        }

        $json | ConvertTo-Json -Depth 10 | Set-Content $file.FullName
        Write-Host "Updated $($file.Name)"
    }
    catch {
        Write-Warning "Error processing $($file.Name): $_"
    }
}
