
$unitsPath = "C:\Users\duxbu\OneDrive\Documents\code\waryes\units"
$files = Get-ChildItem -Path $unitsPath -Recurse -Filter "*.json"

foreach ($file in $files) {
    $json = Get-Content $file.FullName -Raw | ConvertFrom-Json
    
    # Infer category
    $id = $json.id
    $cat = "INF" # Default? Or LOG?

    if ($id -match "supply" -or $id -match "logistics" -or $id -match "fob" -or $id -match "truck") { $cat = "LOG" }
    elseif ($id -match "trooper" -or $id -match "engineer" -or $id -match "riflemen" -or $id -match "squad" -or $id -match "infantry" -or $id -match "hwt" -or $id -match "flamethrower" -or $id -match "sniper") { $cat = "INF" }
    elseif ($id -match "mbt" -or $id -match "tank" -or $id -match "armor") { $cat = "TNK" }
    elseif ($id -match "scout" -or $id -match "recon") { $cat = "REC" }
    elseif ($id -match "aa" -or $id -match "sam" -or $id -match "skysweeper" -or $id -match "missile") { $cat = "AA" }
    elseif ($id -match "artillery" -or $id -match "mortar" -or $id -match "howitzer" -or $id -match "tremor") { $cat = "ART" }
    elseif ($id -match "heli" -or $id -match "gunship" -or $id -match "osprey" -or $id -match "vtol") { $cat = "HEL" }
    elseif ($id -match "jet" -or $id -match "fighter" -or $id -match "bomber" -or $id -match "interceptor") { $cat = "AIR" }
    
    # Manual overrides if needed
    if ($id -eq "sdf_behemoth") { $cat = "TNK" }
    if ($id -match "transport") { $cat = "HEL" } # Or LOG? Usually HEL/Vehicle tab. Wargame puts transports in same tab as inf if selected, but if standalone?
    # Actually transport trucks are usually VEH or LOG.
    if ($id -match "transport_truck") { $cat = "LOG" } # Maybe?
    
    # Add category property
    $json | Add-Member -Type NoteProperty -Name "category" -Value $cat -Force

    # Save back
    $json | ConvertTo-Json -Depth 10 | Set-Content $file.FullName
    Write-Host "Updated $id to $cat"
}
