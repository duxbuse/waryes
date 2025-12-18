using Godot;
using System.Collections.Generic;

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

	private NavigationRegion3D _regionHighway;
	private NavigationRegion3D _regionTown;
	private NavigationRegion3D _regionDirt;
	private NavigationRegion3D _regionField;
	private NavigationRegion3D _regionForest;
	
	// Parent root for organization
	private Node3D _mapRoot;

	// Textures
	private Texture2D _texHighway;
	private Texture2D _texTownRoad;
	private Texture2D _texDirtRoad;
	private Texture2D _texGrass;
	private Texture2D _texForest;
	private Texture2D _texLake;

	public override void _Ready()
	{
		if (Engine.IsEditorHint()) return;
		LoadTextures();
		GenerateTerrain();
	}

	private void LoadTextures()
	{
		_texHighway = LoadTexture("highway.jpg");
		_texTownRoad = LoadTexture("town_road.jpg");
		_texDirtRoad = LoadTexture("dirt_road.jpg");
		_texGrass = LoadTexture("grass_field.jpg");
		_texForest = LoadTexture("forest_floor.jpg");
		_texLake = LoadTexture("lake_water.jpg");
	}

	private Texture2D LoadTexture(string fileName)
	{
		string path = $"res://assets/textures/{fileName}";
		var tex = ResourceLoader.Load<Texture2D>(path);
		if (tex == null)
		{
			GD.PrintErr($"Failed to load texture: {path}");
		}
		return tex;
	}

	private void GenerateTerrain()
	{
		GD.Print("MapBuilder: Generating Terrain...");
		
		if (_texHighway == null) LoadTextures();
		
		// Clear children
		foreach(Node child in GetChildren())
		{
			child.QueueFree();
		}
		
		_mapRoot = new Node3D();
		_mapRoot.Name = "MapRoot";
		AddChild(_mapRoot);
		
		// Initialize Regions
		_regionHighway = CreateRegion("Region_Highway", 1.0f);
		_regionTown = CreateRegion("Region_Town", 2.0f);
		_regionDirt = CreateRegion("Region_Dirt", 2.0f);
		_regionField = CreateRegion("Region_Field", 10.0f);
		_regionForest = CreateRegion("Region_Forest", 20.0f);

		// Map Parameters
		float mapSize = 400.0f;
		float halfSize = mapSize / 2.0f;

		// Base Ground -> Fields (Grass) - Using plane for better UV control
		CreatePlane("GroundBase", Vector3.Zero, new Vector2(mapSize, mapSize), _texGrass, _regionField, new Vector2(50, 50));

		// Highway Logic
		int highwayAxis = GD.Randf() > 0.5f ? 0 : 1;
		Vector3 highwayStart = Vector3.Zero;
		Vector3 highwayEnd = Vector3.Zero;
		Vector2 highwayPlaneSize = Vector2.Zero;
		float highwayRotation = 0.0f;

		if (highwayAxis == 0) // East-West
		{
			highwayStart = new Vector3(-halfSize, 0, 0);
			highwayEnd = new Vector3(halfSize, 0, 0);
			highwayPlaneSize = new Vector2(mapSize, 20);
			highwayRotation = 0.0f; // No rotation needed 
		}
		else // North-South
		{
			highwayStart = new Vector3(0, 0, -halfSize);
			highwayEnd = new Vector3(0, 0, halfSize);
			highwayPlaneSize = new Vector2(mapSize, 20);
			highwayRotation = 90.0f; // Rotate 90 degrees to align texture
		}

		// Create Highway Geometry with proper rotation
		Vector2 highwayUV = new Vector2(40, 2); // UV is now consistent, rotation handles orientation
		CreatePlane("Highway", Vector3.Up * 0.05f, highwayPlaneSize, _texHighway, _regionHighway, highwayUV, highwayRotation);
		
		CreateRoadLines(Vector3.Up * 0.16f, highwayAxis == 0 ? mapSize : mapSize, 20, _regionHighway, highwayAxis == 1); 

		// Spawn Points
		GenerateSpawnPoints(highwayAxis, halfSize, _regionField);

		// Town Generation
		CreateTown(highwayAxis, halfSize);

		// Farming Landscape (Fields & Hedgerows & Dirt Roads)
		CreateFarmingLandscape(halfSize);

		// Capture Zones
		CreateCaptureZones(halfSize, _mapRoot); 
		
		// Bake All
		GD.Print("MapBuilder: Baking Navigation Meshes...");
		_regionHighway.BakeNavigationMesh();
		_regionTown.BakeNavigationMesh();
		_regionDirt.BakeNavigationMesh();
		_regionField.BakeNavigationMesh();
		_regionForest.BakeNavigationMesh();
		GD.Print("MapBuilder: Baking Complete!");
		
		if (Engine.IsEditorHint())
		{
			 RecursivelySetOwner(_mapRoot, GetTree().EditedSceneRoot);
		}
	}
