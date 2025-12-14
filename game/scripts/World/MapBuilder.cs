using Godot;

public partial class MapBuilder : Node3D
{
    public override void _Ready()
    {
        GenerateTerrain();
    }

    private void GenerateTerrain()
    {
        // Road
        CreateStrip("Road", new Vector3(0, 0.01f, 0), new Vector3(100, 0.1f, 10), new Color(0.3f, 0.3f, 0.3f));
        CreateRoadLines(new Vector3(0, 0.02f, 0), 100, 10);
        
        // Lake
        CreateCylinder("Lake", new Vector3(-20, 0.01f, 20), 15.0f, new Color(0, 0, 1));
        
        // Town
        CreateBlockCluster("Town", new Vector3(20, 0, -20), 5, new Color(0.6f, 0.4f, 0.2f));
        CreateBoundary("TownBoundary", new Vector3(20, 0.01f, -20), new Vector2(30, 30), new Color(0.6f, 0.4f, 0.2f, 0.3f));

        // Forest
        CreateForest("Forest", new Vector3(-20, 0, -20), 10);
        CreateBoundary("ForestBoundary", new Vector3(-20, 0.01f, -20), new Vector2(30, 30), new Color(0, 0.5f, 0, 0.3f));
    }

    private void CreateRoadLines(Vector3 center, float length, float width)
    {
        int segments = (int)(length / 4);
        var root = new Node3D();
        root.Name = "RoadLines";
        AddChild(root);
        
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
    
    private void CreateBoundary(string name, Vector3 center, Vector2 size, Color color)
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

    private void CreateStrip(string name, Vector3 pos, Vector3 size, Color color)
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

    private void CreateCylinder(string name, Vector3 pos, float radius, Color color)
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

    private void CreateBlockCluster(string name, Vector3 center, int count, Color color)
    {
        var root = new Node3D();
        root.Name = name;
        AddChild(root);

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

    private void CreateForest(string name, Vector3 center, int count)
    {
        var root = new Node3D();
        root.Name = name;
        AddChild(root);
        
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
        }
    }
}
