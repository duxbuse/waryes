
$UNITS_DIR = "c:\Users\duxbu\OneDrive\Documents\code\waryes\units"
$HEAVY_KEYWORDS = @("cannon", "missile", "rocket", "bomb", "mortar", "howitzer", "fusion", "launcher", "railgun")
$AMMO_HEAVY = 10
$AMMO_STANDARD = 20

function Is-Heavy {
    param([string]$WeaponId)
    $wid = $WeaponId.ToLower()
    foreach ($kw in $HEAVY_KEYWORDS) {
        if ($wid.Contains($kw)) {
            if ($wid.Contains("rotary") -and -not $wid.Contains("missile")) {
                return $false
            }
            return $true
        }
    }
    return $false
}

Write-Host "Starting Ammo Rebalance..."
$files = Get-ChildItem -Path $UNITS_DIR -Recurse -Filter "*.json"
$count = 0

foreach ($file in $files) {
    Write-Host "Processing $($file.Name)..."
    $jsonContent = Get-Content -Raw $file.FullName | ConvertFrom-Json
    $updated = $false

    # Detect Infantry
    $isInfantry = $false
    $idName = $jsonContent.id + " " + $jsonContent.name
    if ($idName -match "infantry|brood|trooper|squad|team|militia|scout") {
         $isInfantry = $true
    }
    # Specific check for Vanguard Infantry if not caught by above (though 'infantry' should catch it)
    if ($idName -match "vanguard_infantry") {
        $isInfantry = $true
    }
    # Armor Check (0 front armor usually implies infantry/soft target)
    if ($jsonContent.armor.front -eq 0) {
        $isInfantry = $true
    }
    
    # Exclude known vehicles that might have triggered keywords
    if ($idName -match "tank|apc|vehicle|walker|gunship|fighter|bomber|truck") {
        $isInfantry = $false
    }

    if ($jsonContent.PSObject.Properties.Match("weapons").Count -gt 0) {
        foreach ($weapon in $jsonContent.weapons) {
            $wid = $weapon.weapon_id
            $currentAmmo = if ($weapon.PSObject.Properties.Match("max_ammo").Count -gt 0) { $weapon.max_ammo } else { 999 }
            
            $targetAmmo = $AMMO_STANDARD
            
            # Default Heavy Rule
            if (Is-Heavy -WeaponId $wid) {
                $targetAmmo = $AMMO_HEAVY
            }
            
            # Infantry AT Override
            if ($isInfantry) {
                if ($wid -match "at_launcher|rocket|manpad|missile") {
                    $targetAmmo = 5
                }
            }

            if ($currentAmmo -ne $targetAmmo) {
                # PowerShell JSON object handling can be tricky, constructing new object to ensure property exists
                $weapon | Add-Member -MemberType NoteProperty -Name "max_ammo" -Value $targetAmmo -Force
                $updated = $true
                Write-Host "  - $wid : $currentAmmo -> $targetAmmo"
            }
        }
    }

    if ($updated) {
        $jsonContent | ConvertTo-Json -Depth 10 | Set-Content $file.FullName
        Write-Host "Updated $($file.Name)"
        $count++
    }
}

Write-Host "Finished processing $count files."
