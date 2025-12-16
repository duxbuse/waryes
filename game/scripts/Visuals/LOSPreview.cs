using Godot;
using System.Collections.Generic;

public partial class LOSPreview : Node3D
{
    public static LOSPreview Instance { get; private set; }
    
    private bool _isActive = false;
    private Vector3 _previewPosition;
    private MeshInstance3D _visionMesh;
    private ArrayMesh _arrayMesh;
    private StandardMaterial3D _material;
    
    private MeshInstance3D _rangeRing;
    private StandardMaterial3D _rangeMaterial;
    
    private const float VISION_RANGE = 50.0f;
    private const int RAYCAST_SEGMENTS = 60;
    
    public override void _Ready()
    {
        Instance = this;
        
        // Create mesh for vision cone
        _visionMesh = new MeshInstance3D();
        _visionMesh.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
        AddChild(_visionMesh);
        
        _arrayMesh = new ArrayMesh();
        _visionMesh.Mesh = _arrayMesh;
        
        _material = new StandardMaterial3D();
        _material.AlbedoColor = new Color(0, 1, 0, 0.3f); // Semi-transparent green
        _material.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _material.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        _material.CullMode = BaseMaterial3D.CullModeEnum.Disabled; // Show both sides
        
        _visionMesh.MaterialOverride = _material;
        _visionMesh.Visible = false;
        
        // Range Ring
        _rangeRing = new MeshInstance3D();
        _rangeRing.Name = "RangeRing";
        _rangeRing.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
        AddChild(_rangeRing);
        
        var torus = new TorusMesh();
        _rangeRing.Mesh = torus;
        
        _rangeMaterial = new StandardMaterial3D();
        _rangeMaterial.AlbedoColor = new Color(1, 1, 1, 0.5f);
        _rangeMaterial.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        _rangeMaterial.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _rangeRing.MaterialOverride = _rangeMaterial;
        _rangeRing.Visible = false;
    }
    
    public override void _Process(double delta)
    {
        if (!_isActive) return;
        
        // Get mouse position in 3D world
        var mousePos = GetViewport().GetMousePosition();
        var camera = GetViewport().GetCamera3D();
        if (camera == null) return;
        
        // Raycast to ground
        var from = camera.ProjectRayOrigin(mousePos);
        var to = from + camera.ProjectRayNormal(mousePos) * 1000.0f;
        
        var spaceState = GetViewport().World3D.DirectSpaceState;
        var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF);
        var result = spaceState.IntersectRay(query);
        
        if (result.Count > 0)
        {
            _previewPosition = (Vector3)result["position"];
            _previewPosition = (Vector3)result["position"];
            UpdateVisionMesh();
            UpdateRangeRing();
            _visionMesh.Visible = true;
        }
        else
        {
            _visionMesh.Visible = false;
            _rangeRing.Visible = false;
        }
    }
    
    public void SetActive(bool active)
    {
        _isActive = active;
        if (!active)
        {
            _visionMesh.Visible = false;
            if (_rangeRing != null) _rangeRing.Visible = false;
        }
    }
    
    private void UpdateVisionMesh()
    {
        var vertices = new List<Vector3>();
        var indices = new List<int>();
        
        // Detect terrain type at preview position
        float visionRange = GetVisionRangeForTerrain(_previewPosition);
        
        // Center point (slightly above ground)
        Vector3 center = _previewPosition + Vector3.Up * 0.2f;
        vertices.Add(center); // Index 0
        
        var spaceState = GetViewport().World3D.DirectSpaceState;
        
        // Perform raycast fan
        for (int i = 0; i <= RAYCAST_SEGMENTS; i++)
        {
            float angle = (float)i / RAYCAST_SEGMENTS * Mathf.Tau;
            Vector3 dir = new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle));
            
            Vector3 rayStart = _previewPosition + Vector3.Up * 1.5f; // Eye height
            
            // Default max range based on current position terrain
            float currentMaxRange = visionRange;
            
            // Calculate effective range for this specific angle
            // If the ray enters a forest, clamp range to "Distance to Forest + 5m"
            // We need to raycast purely for logic first, then physics.
            // Or simpler: Math check against known forest circle.
            
            float distToForest = DistanceToForestAlongRay(_previewPosition, dir);
            if (distToForest < float.MaxValue)
            {
                // Ray hits/enters forest
                // If we are IN forest, dist is 0 (or negative logic).
                // If we are OUTSIDE, dist is distance to edge.
                
                // If we are inside, standard logic applies (already reduced to 15m/5m by GetVisionRangeForTerrain).
                // If we are outside, looking IN:
                if (!IsInForest(_previewPosition))
                {
                    float penetration = 5.0f; // Max vision into forest
                    float effectiveForestRange = distToForest + penetration;
                    if (effectiveForestRange < currentMaxRange)
                    {
                        currentMaxRange = effectiveForestRange;
                    }
                }
            }
            
            Vector3 rayEnd = _previewPosition + dir * currentMaxRange; 
            
            var query = PhysicsRayQueryParameters3D.Create(rayStart, rayEnd, 0xFFFFFFFF);
            var result = spaceState.IntersectRay(query);
            
            Vector3 hitPoint;
            if (result.Count > 0)
            {
                hitPoint = (Vector3)result["position"];
                hitPoint.Y = _previewPosition.Y + 0.2f; // Flatten to ground level
            }
            else
            {
                // No hit, use max range
                hitPoint = rayEnd;
                hitPoint.Y = _previewPosition.Y + 0.2f;
            }
            
            vertices.Add(hitPoint);
        }
        
        // Build triangles (fan from center)
        for (int i = 1; i <= RAYCAST_SEGMENTS; i++)
        {
            indices.Add(0);
            indices.Add(i);
            indices.Add(i + 1);
        }
        
        // Update mesh
        var arrays = new Godot.Collections.Array();
        arrays.Resize((int)Mesh.ArrayType.Max);
        arrays[(int)Mesh.ArrayType.Vertex] = vertices.ToArray();
        arrays[(int)Mesh.ArrayType.Index] = indices.ToArray();
        
        _arrayMesh.ClearSurfaces();
        _arrayMesh.AddSurfaceFromArrays(Mesh.PrimitiveType.Triangles, arrays);
    }
    
    private float GetVisionRangeForTerrain(Vector3 position)
    {
        // Check if position is in forest
        if (IsInForest(position))
        {
            // Visual feedback could be added here (e.g. change color)
            _material.AlbedoColor = new Color(1, 0, 0, 0.3f); // Red tint for restricted
            return 15.0f; // Reduced from 50
        }
        
        // Check if in town
        if (IsInTown(position))
        {
            _material.AlbedoColor = new Color(1, 0.5f, 0, 0.3f); // Orange tint
            return 25.0f; // Reduced from 50
        }
        
        // Check if on road
        if (IsOnRoad(position))
        {
            _material.AlbedoColor = new Color(0, 0, 1, 0.3f); // Blue tint
            return 70.0f; // Boost
        }
        
        _material.AlbedoColor = new Color(0, 1, 0, 0.3f); // Green default
        
        // Default open terrain
        return VISION_RANGE;
    }

    private bool IsInForest(Vector3 position)
    {
        // Forest is centered at (-20, 0, -20) with ~30x30 size
        Vector2 forestCenter = new Vector2(-20, -20);
        Vector2 pos2D = new Vector2(position.X, position.Z);
        float forestRadius = 15.0f; // Half of 30
        
        bool inForest = pos2D.DistanceTo(forestCenter) < forestRadius;
        // GD.Print($"Checking Forest: Pos={pos2D}, Center={forestCenter}, Dist={pos2D.DistanceTo(forestCenter)}, In={inForest}");
        return inForest;
    }
    
    private bool IsInTown(Vector3 position)
    {
        // Town is centered at (20, 0, -20) with ~30x30 size
        Vector2 townCenter = new Vector2(20, -20);
        Vector2 pos2D = new Vector2(position.X, position.Z);
        float townRadius = 15.0f;
        
        return pos2D.DistanceTo(townCenter) < townRadius;
    }
    
    private bool IsOnRoad(Vector3 position)
    {
        // Road is at Z=0, width=10, length=100
        return Mathf.Abs(position.Z) < 5.0f && Mathf.Abs(position.X) < 50.0f;
    }
    private float DistanceToForestAlongRay(Vector3 start, Vector3 dir)
    {
        // Intersect Ray (start, dir) with Circle (Center, Radius)
        // 2D Math
        Vector2 p = new Vector2(start.X, start.Z);
        Vector2 d = new Vector2(dir.X, dir.Z).Normalized();
        
        Vector2 fCenter = new Vector2(-20, -20);
        float fRadius = 15.0f;
        
        Vector2 f = p - fCenter;
        
        float a = d.Dot(d);
        float b = 2 * f.Dot(d);
        float c = f.Dot(f) - fRadius * fRadius;
        
        float discriminant = b*b - 4*a*c;
        if (discriminant < 0) return float.MaxValue; // No intersection, looking away or miss
        
        discriminant = Mathf.Sqrt(discriminant);
        
        float t1 = (-b - discriminant) / (2*a);
        float t2 = (-b + discriminant) / (2*a);
        
        // We want the first positive intersection
        if (t1 >= 0) return t1;
        if (t2 >= 0) return t2;
        
        return float.MaxValue; // Inside or behind? If inside, t1 < 0 and t2 > 0.
        // If we are inside, we handled it with IsInForest check already.
        // This function is for "Outside looking In".
    }
    private void UpdateRangeRing()
    {
         if (SelectionManager.Instance == null || SelectionManager.Instance.SelectedUnits.Count == 0)
         {
             _rangeRing.Visible = false;
             return;
         }
         
         var unit = SelectionManager.Instance.SelectedUnits[0];
         if (unit == null || !IsInstanceValid(unit)) 
         {
              _rangeRing.Visible = false;
              return;
         }
         
         float range = unit.GetMaxRange();
         if (range <= 1.0f)
         {
              _rangeRing.Visible = false;
              return;
         }
         
         var torus = _rangeRing.Mesh as TorusMesh;
         if (torus != null)
         {
             if (Mathf.Abs(torus.OuterRadius - range) > 0.01f)
             {
                 torus.OuterRadius = range;
                 torus.InnerRadius = range - 0.2f;
             }
         }
         
         _rangeRing.GlobalPosition = _previewPosition + Vector3.Up * 0.3f;
         _rangeRing.Visible = true;
    }
}
