using Godot;

public partial class GameManager : Node
{
    public static GameManager Instance { get; private set; }
    
    public UnitManager UnitManager;

    public override void _Ready()
    {
        Instance = this;
        
        // Setup UnitManager
        UnitManager = new UnitManager();
        UnitManager.Name = "UnitManager";
        AddChild(UnitManager);
        
        // Wait a frame for things to initialize, then spawn
        CallDeferred(nameof(SpawnTestUnits));
    }
    
    private void SpawnTestUnits()
    {
        GD.Print("GameManager: Spawning test units...");
        // IDs taken from file list earlier
        UnitManager.SpawnUnit("sdf_bastion_mbt", new Vector3(0, 0, 0));
        UnitManager.SpawnUnit("sdf_trooper", new Vector3(5, 0, 2));
        UnitManager.SpawnUnit("sdf_scout_walker", new Vector3(-5, 0, -2)); 
        UnitManager.SpawnUnit("sdf_osprey_gunship", new Vector3(0, 0, 5)); // Air unit test
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        // Right click to move selected units
        if (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Right)
        {
            var selectedUnits = SelectionManager.Instance?.SelectedUnits;
            if (selectedUnits == null || selectedUnits.Count == 0) return;
            
            var camera = GetViewport().GetCamera3D();
            if (camera == null) return;
            
            // Raycast to ground plane (Y=0)
            var origin = camera.ProjectRayOrigin(mb.Position);
            var dir = camera.ProjectRayNormal(mb.Position);
            
            var plane = new Plane(Vector3.Up, 0);
            var intersection = plane.IntersectsRay(origin, dir);
            
            if (intersection.HasValue)
            {
                GD.Print($"Commanding move to: {intersection.Value}");

                foreach (var unit in selectedUnits)
                {
                    // Adding small random offset so they don't stack perfectly
                    Vector3 offset = new Vector3(GD.Randf() * 2 - 1, 0, GD.Randf() * 2 - 1);
                    unit.MoveTo(intersection.Value + offset);
                }
                
                GetViewport().SetInputAsHandled();
            }
        }
    }
}
