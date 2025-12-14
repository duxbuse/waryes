# Unit Normalizer
$waryesRoot = "c:\Users\duxbu\OneDrive\Documents\code\waryes"
$unitFiles = Get-ChildItem -Path "$waryesRoot\units" -Recurse -Filter "*.json"

$factions = @{
    "sdf" = "assets/icons/factions/sdf_faction_icon_main.png";
    "vanguard" = "assets/icons/factions/vanguard_faction_icon_main.png"
}

foreach ($file in $unitFiles) {
    try {
        $json = Get-Content $file.FullName | ConvertFrom-Json
        $changed = $false
        $baseName = $file.BaseName
        
        # 1. Metadata Injection (ID, Name, Icon)
        if (-not $json.id) {
            $json | Add-Member -NotePropertyName "id" -NotePropertyValue $baseName
            $changed = $true
        }
        
        if (-not $json.name) {
            $humanName = $baseName -replace "_", " " -replace "sdf ", "" -replace "vanguard ", "" 
            $humanName = (Get-Culture).TextInfo.ToTitleCase($humanName)
            $json | Add-Member -NotePropertyName "name" -NotePropertyValue $humanName
            $changed = $true
        }

        if (-not $json.icon) {
            $factionKey = if ($baseName -match "sdf") { "sdf" } else { "vanguard" }
            $json | Add-Member -NotePropertyName "icon" -NotePropertyValue $factions[$factionKey]
            $changed = $true
        }

        # 2. Stat Normalization
        # Fix HP (150 -> 12)
        if ($json.health -gt 20) {
            $newHealth = [math]::Round($json.health / 12) # Crude scaling
            if ($newHealth -gt 15) { $newHealth = 12 } # Cap for Heavy Tanks
            if ($newHealth -lt 4) { $newHealth = 5 }   # Floor
            $json.health = $newHealth
            $changed = $true
        }

        # Fix Speed (Tanks 35 -> 70, Wheeled 50 -> 100)
        # Heuristic: If it has heavy armor (front > 50) and low speed (<50), assume tracked/slow
        if ($json.speed.road -lt 50 -and $json.armor.front -gt 10) {
            # Likely a tank or APC with 'gamey' speed values. GDD says Tracked Road = 70.
            $json.speed.road = 70
            $json.speed.off_road = 50
            $changed = $true
        }

        if ($changed) {
            # Reorder properties nicely (ID first)
            $orderedObject = [PSCustomObject]@{
                id = $json.id
                name = $json.name
                cost = $json.cost
                icon = $json.icon
                health = $json.health
                speed = $json.speed
                armor = $json.armor
                fuel = $json.fuel
                autonomy = $json.autonomy
                optics = $json.optics
                stealth = $json.stealth
                forward_deploy = $json.forward_deploy
                weapons = $json.weapons
            }
            
            $orderedObject | ConvertTo-Json -Depth 10 | Set-Content $file.FullName
            Write-Host "Normalized $($file.Name)"
        }
    }
    catch {
        Write-Warning "Failed $($file.Name): $_"
    }
}
