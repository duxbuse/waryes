using Godot;
using WarYes.Data;

public static class DamageCalculator
{
    // Return final damage
    public static float ResolveHit(int ap, float damageMultiplier, Unit target, Vector3 hitSourcePos)
    {
        int armor = GetProjectedArmor(target, hitSourcePos);
        return CalculateDamage(ap, armor, damageMultiplier);
    }

    public static int GetProjectedArmor(Unit target, Vector3 hitSourcePos)
    {
        // Vector from target TO source (to see which face is hit)
        // Wait. "Front" armor is hit when source is in front.
        // Vector FROM target TO source is roughly the "Incoming" angle relative to target facing?
        // Let's use Source Position relative to Target.
        
        Vector3 toSource = (hitSourcePos - target.GlobalPosition).Normalized();
        Vector3 forward = -target.GlobalTransform.Basis.Z; // Forward is -Z
        Vector3 right = target.GlobalTransform.Basis.X;
        
        // Angle calculations
        // Dot product: 1.0 = Front, -1.0 = Rear, 0 = Side
        float dot = forward.Dot(toSource);
        
        // 90 degree Cone for Front means +/- 45 degrees from Forward?
        // Or 90 degrees total arc? "Front (Arc 90)" usually means +/- 45 deg.
        // Cos(45) ~= 0.707
        
        // Front: Dot > 0.707
        // Rear: Dot < -0.707
        // Side: Between -0.707 and 0.707
        
        int armor = 0;
        
        // Top armor check? (Elevation?)
        // Vector3.Up dot toSource?
        // usage: if (toSource.Y > 0.8) return target.Data.Armor.Top;
        // For now simplifying to flat plane.
        
        if (dot > 0.707f)
        {
            armor = target.Data.Armor.Front;
        }
        else if (dot < -0.707f)
        {
            armor = target.Data.Armor.Rear;
        }
        else
        {
            armor = target.Data.Armor.Side;
        }
        
        return armor;
    }

    public static float CalculateDamage(int ap, int armor, float multiplier = 1.0f)
    {
        // Formula: max(floor((ap - armour)/2)+1,0)
        float val = Mathf.FloorToInt((ap - armor) / 2.0f) + 1;
        float baseDmg = Mathf.Max(val, 0);
        return baseDmg * multiplier;
    }
}
