using Godot;
using System.Collections.Generic;

public partial class CombatManager : Node
{
    private float _fowTimer = 0.0f;
    private const float FOW_INTERVAL = 0.2f; // 5 times a second
    
    public override void _Ready()
    {
        SpawnEnemies();
    }
    
    private void SpawnEnemies()
    {
        if (UnitManager.Instance == null) return;

        GD.Print("CombatManager: Spawning Enemies...");
        
        // Check if we're in setup phase to freeze units
        bool isSetupPhase = GameManager.Instance != null && GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup;
        
        // Placed close (10,0,10) to be visible immediately for testing FOW/Spawning
        var e1 = UnitManager.Instance.SpawnUnit("enemy_sdf_bastion_mbt", new Vector3(20, 0, 10)); // Closer
        if (e1 != null) 
        { 
            e1.Team = "Enemy"; // Force Team just in case
            if (isSetupPhase) e1.SetFrozen(true);
        }
        
        var e2 = UnitManager.Instance.SpawnUnit("enemy_sdf_trooper", new Vector3(35, 0, 32));
        if (e2 != null) 
        { 
            e2.Team = "Enemy";
            if (isSetupPhase) e2.SetFrozen(true);
        }
        
        var e3 = UnitManager.Instance.SpawnUnit("enemy_sdf_trooper", new Vector3(25, 0, 35));
        if (e3 != null && isSetupPhase) e3.SetFrozen(true);
        
        // Additional enemies spread out for LOS testing
        var e4 = UnitManager.Instance.SpawnUnit("enemy_sdf_trooper", new Vector3(50, 0, -50));
        if (e4 != null && isSetupPhase) e4.SetFrozen(true);
        
        var e5 = UnitManager.Instance.SpawnUnit("enemy_sdf_scout_walker", new Vector3(-40, 0, -10));
        if (e5 != null && isSetupPhase) e5.SetFrozen(true);
        
        var eAir = UnitManager.Instance.SpawnUnit("enemy_sdf_falcon_gunship_rotary", new Vector3(-20, 0, 40));
        if (eAir != null) 
        { 
            eAir.Team = "Enemy";
            if (isSetupPhase) eAir.SetFrozen(true);
        }
        
        // Far away enemy
        var e6 = UnitManager.Instance.SpawnUnit("enemy_sdf_bastion_mbt", new Vector3(80, 0, 0));
        if (e6 != null && isSetupPhase) e6.SetFrozen(true);
        
        // Hide behind building (assuming town takes up 20,0,-20 area)
        var e7 = UnitManager.Instance.SpawnUnit("enemy_sdf_scout_walker", new Vector3(25, 0, -25));
        if (e7 != null && isSetupPhase) e7.SetFrozen(true);
    }
    
    public override void _Process(double delta)
    {
        _fowTimer -= (float)delta;
        if (_fowTimer <= 0)
        {
            _fowTimer = FOW_INTERVAL;
            UpdateFogOfWar();
        }
    }
    
    private void UpdateFogOfWar()
    {
        if (UnitManager.Instance == null) return;
        var units = UnitManager.Instance.GetActiveUnits();
        var playerUnits = new List<Unit>();
        var enemyUnits = new List<Unit>();
        
        foreach (var u in units)
        {
            // Skip invalid units
            if (u == null || !IsInstanceValid(u) || u.IsQueuedForDeletion()) continue;
            
            if (u.Team == "Player") playerUnits.Add(u);
            else enemyUnits.Add(u);
        }
        
        foreach (var enemy in enemyUnits)
        {
            // Double-check validity (unit could have died during iteration)
            if (!IsInstanceValid(enemy) || enemy.IsQueuedForDeletion()) continue;
            
            bool isVisible = false;
            
            // Check against all player units
            foreach (var player in playerUnits)
            {
                // Check validity before accessing position
                if (!IsInstanceValid(player) || player.IsQueuedForDeletion()) continue;
                
                float distSq = player.GlobalPosition.DistanceSquaredTo(enemy.GlobalPosition);
                
                // Max vision range (e.g., 50m)
                if (distSq < 2500.0f) 
                {
                    // Raycast check
                    var spaceState = GetViewport().World3D.DirectSpaceState;
                    var from = player.GlobalPosition + Vector3.Up * 2;
                    var to = enemy.GlobalPosition + Vector3.Up * 2;
                    var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF, new Godot.Collections.Array<Godot.Rid> { player.GetRid(), enemy.GetRid() }); 
                    // Exclude self and target to see if anything blocks
                    
                    var result = spaceState.IntersectRay(query);
                    
                    if (result.Count == 0) // Clear LOS
                    {
                        isVisible = true;
                        break;
                    }
                    else
                    {
                         // Hit something (Building? Tree?)
                         // If we hit terrain, visibility blocked
                    }
                }
            }
            
            // Update Visibility of VisualRoot
            if (enemy.Visuals != null && enemy.Visuals.VisualRoot != null)
            {
                enemy.Visuals.VisualRoot.Visible = isVisible;
            }
        }
    }
}
