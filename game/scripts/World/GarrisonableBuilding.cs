using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class GarrisonableBuilding : StaticBody3D
{
    [Export]
    public int Capacity = 10;
    
    [Export]
    public bool IsHighGround = false; // Checks "Church" or "Tower" logic

    public List<Unit> Occupants { get; private set; } = new List<Unit>();
    
    // Visuals
    private MeshInstance3D _visualMesh;
    private StandardMaterial3D _originalMaterial;
    private StandardMaterial3D _garrisonedMaterial;
    
    public override void _Ready()
    {
        // Try to find the visual mesh to tint
        _visualMesh = GetNodeOrNull<MeshInstance3D>("Mesh");
        if (_visualMesh == null)
        {
            // Look deeper? Or assumption
            foreach(var child in GetChildren())
            {
                if (child is MeshInstance3D m) 
                {
                    _visualMesh = m;
                    break;
                }
            }
        }
        
        if (_visualMesh != null)
        {
            // Clone original material or create new
            if (_visualMesh.MaterialOverride != null) _originalMaterial = (StandardMaterial3D)_visualMesh.MaterialOverride.Duplicate();
            else if (_visualMesh.Mesh != null && _visualMesh.Mesh.GetSurfaceCount() > 0) 
                 _originalMaterial = (StandardMaterial3D)_visualMesh.Mesh.SurfaceGetMaterial(0); // Fallback
            
            // Create garrison material
            _garrisonedMaterial = new StandardMaterial3D();
            _garrisonedMaterial.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
            _garrisonedMaterial.AlbedoColor = new Color(0.5f, 0.5f, 0.5f, 0.5f); // Neutral default
        }
        
        AddToGroup("Garrisonable");
    }

    public bool TryEnter(Unit unit)
    {
        if (Occupants.Count >= Capacity) return false;
        if (Occupants.Contains(unit)) return false;

        Occupants.Add(unit);
        unit.EnterBuilding(this);
        
        UpdateVisuals();
        GD.Print($"{unit.Name} entered building {Name}. Occupants: {Occupants.Count}/{Capacity}");
        return true;
    }

    public void Exit(Unit unit)
    {
        if (Occupants.Contains(unit))
        {
            Occupants.Remove(unit);
            // Unit.ExitBuilding handled by Unit usually, but good to ensure
            UpdateVisuals();
            GD.Print($"{unit.Name} exited building {Name}.");
        }
    }
    
    // Called when the building triggers (e.g. shot at)
    // We need to act as a proxy.
    // However, StaticBody3D doesn't have "TakeDamage" naturally.
    // The Weapon.cs logic usually does: if (collider is Unit u) u.TakeDamage().
    // We need to modify Weapon.cs or ensure we have a method here that can be called.
    public void TakeFire(float damage, Unit attacker)
    {
        DistributeDamage(damage, attacker);
    }
    
    private void DistributeDamage(float amount, Unit attacker)
    {
        if (Occupants.Count == 0) return;
        
        // Distribute damage evenly or to all?
        // "Damage is distributed to occupants"
        // Let's divide it by count? Or apply splash to all?
        // Usually buildings protect, so maybe split damage among them?
        // Let's go with: Split damage equally among occupants.
        
        float splitDamage = amount / Occupants.Count;
        
        // Iterate backwards in case they die/exit
        for (int i = Occupants.Count - 1; i >= 0; i--)
        {
            if (i >= Occupants.Count) continue;
            var u = Occupants[i];
            
            // Unit.TakeDamage checks for IsGarrisoned and applies 50% reduction there.
            // So we just pass the raw split damage here?
            // Wait, if 10 guys are in there, taking 100 damage -> 10 damage each.
            // Then Reduced by 50% -> 5 damage each.
            // Seems fair.
            
            u.TakeDamage(splitDamage, attacker);
        }
    }

    private void UpdateVisuals()
    {
        if (_visualMesh == null) return;
        
        if (Occupants.Count == 0)
        {
            // Reset
             _visualMesh.MaterialOverride = _originalMaterial;
             return;
        }
        
        // Determine Team
        bool hasPlayer = false;
        bool hasEnemy = false;
        
        foreach(var u in Occupants)
        {
            if (u.Team == "Player") hasPlayer = true;
            else if (u.Team == "Enemy") hasEnemy = true;
        }
        
        Color color = new Color(1, 1, 1);
        if (hasPlayer && hasEnemy)
        {
            // Contested - Yellow/Orange/Striped?
            color = new Color(1, 0.5f, 0, 0.6f); // Orange Transparent
        }
        else if (hasPlayer)
        {
            color = new Color(0, 0, 1, 0.6f); // Blue Transparent
        }
        else if (hasEnemy)
        {
            color = new Color(1, 0, 0, 0.6f); // Red Transparent
        }
        
        if (_garrisonedMaterial == null) _garrisonedMaterial = new StandardMaterial3D();
        _garrisonedMaterial.AlbedoColor = color;
        _garrisonedMaterial.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _garrisonedMaterial.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded; // Make it pop? Or shaded?
        
        _visualMesh.MaterialOverride = _garrisonedMaterial;
    }
    
    public Vector3 GetExitPosition(Vector3 targetDestination)
    {
        // Find closest point on bounding box?
        // Or simply closest side.
        // Simplified: Project direction from center to target, exit at edge.
        // Assuming box shape ~2m radius?
        // Let's define generic "radius" or use collision shape.
        
        Vector3 dir = (targetDestination - GlobalPosition).Normalized();
        return GlobalPosition + dir * 3.0f; // 3m out
    }
}
