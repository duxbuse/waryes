using Godot;

[Tool] // Enable Editor Execution
public partial class MapBuilder : Node3D
{
    [Export]
    public bool BuildMap
    {
        get => false;
        set
        {
            if (value)
            {
                GenerateTerrain();
            }
        }
    }

    private NavigationRegion3D _navRegion;
    private NavigationMesh _navMesh;

    public override void _Ready()
    {
        if (Engine.IsEditorHint()) return; // Don't auto-gen in editor
        
        // Runtime Generation if not already baked?
        // If children exist, assume baked.
        if (GetChildCount() == 0)
        {
             GenerateTerrain();
        }
    }

    private void GenerateTerrain()
    {
        GD.Print("MapBuilder: Generating Terrain...");
        
        // Clear children
        foreach(Node child in GetChildren())
        {
            child.QueueFree();
        }
        
        // Setup Nav Region
        _navRegion = new NavigationRegion3D();
        _navRegion.Name = "NavigationRegion";
        AddChild(_navRegion);
        
        // Setup Nav Mesh resource
        _navMesh = new NavigationMesh();
        _navMesh.AgentHeight = 2.0f;
        _navMesh.AgentRadius = 1.5f; // Match unit size approx
        _navMesh.GeometryParsedGeometryType = NavigationMesh.ParsedGeometryType.StaticColliders; // Safer/Faster for runtime if needed, and avoids GPU readback warning
        _navRegion.NavigationMesh = _navMesh;

        // Use _navRegion as root for all generation
        RecursivelySetOwner(_navRegion, this);


        // Road
        // Road
        CreateStrip("Road", new Vector3(0, 0.01f, 0), new Vector3(100, 0.1f, 10), new Color(0.3f, 0.3f, 0.3f), _navRegion);
        CreateRoadLines(new Vector3(0, 0.02f, 0), 100, 10, _navRegion);

        
        // Lake
        // Lake
        CreateCylinder("Lake", new Vector3(-20, 0.01f, 20), 15.0f, new Color(0, 0, 1), _navRegion);

        
        // Town
        // Town
        CreateBlockCluster("Town", new Vector3(20, 0, -20), 5, new Color(0.6f, 0.4f, 0.2f), _navRegion);
        CreateBoundary("TownBoundary", new Vector3(20, 0.01f, -20), new Vector2(30, 30), new Color(0.6f, 0.4f, 0.2f, 0.3f), _navRegion);


        // Forest
        // Forest
        CreateForest("Forest", new Vector3(-20, 0, -20), 30, _navRegion);
        CreateBoundary("ForestBoundary", new Vector3(-20, 0.01f, -20), new Vector2(30, 30), new Color(0, 0.5f, 0, 0.3f), _navRegion);

        
        // Capture Zone (Bottom Right)
        // Capture Zone (Bottom Right)
        CreateCaptureZone("ObjectiveAlpha", new Vector3(20, 0, 20), _navRegion);
        
        // Bake!
        // Bake!
        GD.Print("MapBuilder: Baking Navigation Mesh...");
        _navRegion.BakeNavigationMesh();
        GD.Print("MapBuilder: Baking Complete!");
        
        // Ensure everything is owned by the scene root if in editor
        if (Engine.IsEditorHint())
        {
             var root = GetTree().EditedSceneRoot;
             if (root != null)
             {
                 RecursivelySetOwner(this, root);
             }
        }
    }
    
    // Helper to set owner for saving
    private void RecursivelySetOwner(Node node, Node owner)
    {
        if (node != owner)
        {
            node.Owner = owner;
        }
        foreach(Node child in node.GetChildren())
        {
            RecursivelySetOwner(child, owner);
        }
    }



    private void CreateCaptureZone(string name, Vector3 pos, Node parent)

    {
        var zone = new CaptureZone();
        zone.Name = name;
        zone.Position = pos;
        
        // Add Collision
        var collisionShape = new CollisionShape3D();
        var shape = new CylinderShape3D();
        shape.Radius = 15.0f;
        shape.Height = 2.0f;
        collisionShape.Shape = shape;
        zone.AddChild(collisionShape);
        
        // Add Visuals (MeshInstance3D expected by CaptureZone script)
        var meshInstance = new MeshInstance3D();
        meshInstance.Name = "MeshInstance3D";
        var mesh = new CylinderMesh();
        mesh.TopRadius = 15.0f;
        mesh.BottomRadius = 15.0f;
        mesh.Height = 0.5f;
        meshInstance.Mesh = mesh;
        
        // Material will be overridden by CaptureZone script logic, but checking just in case
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(0.5f, 0.5f, 0.5f);
        mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        mat.AlbedoColor = new Color(0.5f, 0.5f, 0.5f, 0.5f);
        meshInstance.MaterialOverride = mat;
        
        zone.AddChild(meshInstance);
        
        parent.AddChild(zone);
    }


    private void CreateRoadLines(Vector3 center, float length, float width, Node parent)
    {
        int segments = (int)(length / 4);
        var root = new Node3D();
        root.Name = "RoadLines";
        parent.AddChild(root);

        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(1, 1, 1); // White

        for (int i = 0; i < segments; i++)
        {
            var meshInstance = new MeshInstance3D();
            var mesh = new PlaneMesh();
            mesh.Size = new Vector2(2, 0.5f);
            meshInstance.Mesh = mesh;
            meshInstance.MaterialOverride = mat;
            
            float x = -length / 2 + i * 4;
            meshInstance.Position = center + new Vector3(x, 0.08f, 0); // Raised above road (0.06)
            root.AddChild(meshInstance);
        }
    }
    
    private void CreateBoundary(string name, Vector3 center, Vector2 size, Color color, Node parent)

    {
        var meshInstance = new MeshInstance3D();
        meshInstance.Name = name;
        
        // Use a wireframe-like box or just a transparent plane
        var mesh = new BoxMesh();
        mesh.Size = new Vector3(size.X, 0.5f, size.Y);
        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = color;
        mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        
        meshInstance.Mesh = mesh;
        meshInstance.MaterialOverride = mat;
        meshInstance.Position = center;
        AddChild(meshInstance);
    }

    private void CreateStrip(string name, Vector3 pos, Vector3 size, Color color, Node parent)


    {
        var meshInstance = new MeshInstance3D();
        meshInstance.Name = name;
        var mesh = new BoxMesh();
        mesh.Size = size;
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = color;
        mesh.Material = mat;
        meshInstance.Mesh = mesh;
        meshInstance.Position = pos;
        AddChild(meshInstance);
    }

    private void CreateCylinder(string name, Vector3 pos, float radius, Color color, Node parent)


    {
        var meshInstance = new MeshInstance3D();
        meshInstance.Name = name;
        var mesh = new CylinderMesh();
        mesh.TopRadius = radius;
        mesh.BottomRadius = radius;
        mesh.Height = 0.1f;
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = color;
        mesh.Material = mat;
        meshInstance.Mesh = mesh;
        meshInstance.Position = pos;
        AddChild(meshInstance);
    }

    private void CreateBlockCluster(string name, Vector3 center, int count, Color color, Node parent)
    {
        var root = new Node3D();
        root.Name = name;
        parent.AddChild(root);



        var mat = new StandardMaterial3D();
        mat.AlbedoColor = color;

        for (int i = 0; i < count; i++)
        {
            var meshInstance = new MeshInstance3D();
            var mesh = new BoxMesh();
            mesh.Size = new Vector3(4, 3, 4);
            meshInstance.Mesh = mesh;
            meshInstance.MaterialOverride = mat;
            
            // Random scatter around center
            Vector3 offset = new Vector3(GD.Randf() * 20 - 10, 1.5f, GD.Randf() * 20 - 10);
            meshInstance.Position = center + offset;
            
            // Add Collision
            var staticBody = new StaticBody3D();
            var collisionShape = new CollisionShape3D();
            var shape = new BoxShape3D();
            shape.Size = mesh.Size;
            collisionShape.Shape = shape;
            staticBody.AddChild(collisionShape);
            meshInstance.AddChild(staticBody);
            
            root.AddChild(meshInstance);
        }
    }

    private void CreateForest(string name, Vector3 center, int count, Node parent)
    {
        var root = new Node3D();
        root.Name = name;
        parent.AddChild(root);


        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(0, 0.5f, 0); // Green

        for (int i = 0; i < count; i++)
        {
            var meshInstance = new MeshInstance3D();
            var mesh = new CylinderMesh(); // Tree trunk-ish
            mesh.TopRadius = 0.5f;
            mesh.BottomRadius = 1.0f;
            mesh.Height = 4.0f;
            meshInstance.Mesh = mesh;
            meshInstance.MaterialOverride = mat;

            Vector3 offset = new Vector3(GD.Randf() * 20 - 10, 2.0f, GD.Randf() * 20 - 10);
            meshInstance.Position = center + offset;
            
            // Add Collision
            var staticBody = new StaticBody3D();
            var collisionShape = new CollisionShape3D();
            var shape = new CylinderShape3D();
            shape.Height = mesh.Height;
            shape.Radius = mesh.TopRadius; // Cylinders usually uniform
            collisionShape.Shape = shape;
            staticBody.AddChild(collisionShape);
            meshInstance.AddChild(staticBody);
            
            root.AddChild(meshInstance);
            
            // Note: Obstacles not strictly needed if baked, but useful for dynamic avoidance of the static shape if agents push each other? 
            // Baking is better.
        }
    }
}

