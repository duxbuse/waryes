using Godot;
using System.Collections.Generic;

public partial class VisionVisualizer : Node3D
{
    private MeshInstance3D _meshInstance;
    private ArrayMesh _arrayMesh;
    private StandardMaterial3D _material;
    private float _radius = 30.0f; // Vision range
    private int _segments = 60;
    
    public override void _Ready()
    {
        _meshInstance = new MeshInstance3D();
        _meshInstance.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
        AddChild(_meshInstance);
        
        _arrayMesh = new ArrayMesh();
        _meshInstance.Mesh = _arrayMesh;
        
        _material = new StandardMaterial3D();
        _material.AlbedoColor = new Color(1, 1, 1, 0.2f); // Transparent White
        _material.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _material.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        
        _meshInstance.MaterialOverride = _material;
        
        // Start hidden
        Visible = false;
        
        // Only update occasionally or when moving?
        // Updating every frame for smooth visuals for now.
    }
    
    public override void _PhysicsProcess(double delta)
    {
        if (!Visible) return;
        
        UpdateVisionMesh();
    }
    
    private void UpdateVisionMesh()
    {
        // 1. Raycast fan
        // 2. Build vertices
        
        var vertices = new List<Vector3>();
        var indices = new List<int>();
        
        // Center point (raised slightly to avoid z-fighting with ground)
        Vector3 center = new Vector3(0, 0.2f, 0); 
        vertices.Add(center); // Index 0
        
        var spaceState = GetWorld3D().DirectSpaceState;
        
        for (int i = 0; i <= _segments; i++)
        {
            float angle = (float)i / _segments * Mathf.Tau;
            Vector3 dir = new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle));
            
            Vector3 to = GlobalPosition + dir * _radius;
            // Raycast from slightly up to roughly waist height
            Vector3 from = GlobalPosition + Vector3.Up * 1.5f; 
            
            var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF, new Godot.Collections.Array<Godot.Rid> { ((CharacterBody3D)GetParent()).GetRid() });
            var result = spaceState.IntersectRay(query);
            
            Vector3 hitPosLocal;
            
            if (result.Count > 0)
            {
                 Vector3 hitPoint = (Vector3)result["position"];
                 hitPosLocal = ToLocal(hitPoint);
                 hitPosLocal.Y = 0.2f; // Flatten
            }
            else
            {
                 // No hit, full range
                 hitPosLocal = dir * _radius;
                 hitPosLocal.Y = 0.2f;
            }
            
            vertices.Add(hitPosLocal);
        }
        
        // Build Triangles
        // Center (0) -> Vertex(i) -> Vertex(i+1)
        for (int i = 1; i <= _segments; i++)
        {
            indices.Add(0);
            indices.Add(i);
            indices.Add(i + 1);
        }
        
        // Update Mesh
        var arrays = new Godot.Collections.Array();
        arrays.Resize((int)Mesh.ArrayType.Max);
        arrays[(int)Mesh.ArrayType.Vertex] = vertices.ToArray();
        arrays[(int)Mesh.ArrayType.Index] = indices.ToArray();
        
        _arrayMesh.ClearSurfaces();
        _arrayMesh.AddSurfaceFromArrays(Mesh.PrimitiveType.Triangles, arrays);
    }
}
