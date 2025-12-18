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
	
	// Highway configuration
	private int _highwayAxis; // 0 = East-West, 1 = North-South
	private float _highwayWidth = 20.0f;

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
		_highwayAxis = GD.Randf() > 0.5f ? 0 : 1;
		Vector3 highwayStart = Vector3.Zero;
		Vector3 highwayEnd = Vector3.Zero;
		Vector2 highwayPlaneSize = Vector2.Zero;
		float highwayRotation = 0.0f;

		if (_highwayAxis == 0) // East-West
		{
			highwayStart = new Vector3(-halfSize, 0, 0);
			highwayEnd = new Vector3(halfSize, 0, 0);
			highwayPlaneSize = new Vector2(mapSize, _highwayWidth);
			highwayRotation = 0.0f; // No rotation needed
		}
		else // North-South
		{
			highwayStart = new Vector3(0, 0, -halfSize);
			highwayEnd = new Vector3(0, 0, halfSize);
			highwayPlaneSize = new Vector2(mapSize, _highwayWidth);
			highwayRotation = 90.0f; // Rotate 90 degrees to align texture
		}

		// Create Highway Geometry with proper rotation
		Vector2 highwayUV = new Vector2(40, 2); // UV is now consistent, rotation handles orientation
		CreatePlane("Highway", Vector3.Up * 0.05f, highwayPlaneSize, _texHighway, _regionHighway, highwayUV, highwayRotation); 
		
		CreateRoadLines(Vector3.Up * 0.16f, _highwayAxis == 0 ? mapSize : mapSize, _highwayWidth, _regionHighway, _highwayAxis == 1); 

		// Spawn Points
		GenerateSpawnPoints(_highwayAxis, halfSize, _regionField);

		// Town Generation
		CreateTown(_highwayAxis, halfSize);

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
	
	private NavigationRegion3D CreateRegion(string name, float cost)
	{
		var region = new NavigationRegion3D();
		region.Name = name;
		region.TravelCost = cost;
		
		var mesh = new NavigationMesh();
		mesh.AgentHeight = 2.0f;
		mesh.AgentRadius = 1.5f;
		mesh.GeometryParsedGeometryType = NavigationMesh.ParsedGeometryType.StaticColliders;
		mesh.GeometrySourceGeometryMode = NavigationMesh.SourceGeometryMode.RootNodeChildren; 
		
		region.NavigationMesh = mesh;
		_mapRoot.AddChild(region);
		return region;
	}
	
	private void GenerateSpawnPoints(int highwayAxis, float halfSize, Node parentRegion)
	{
		string p1Team = "Player";
		string p2Team = "Enemy";
		int rpCount = GD.RandRange(2, 4);

		for(int i=0; i<rpCount; i++)
		{
			 float offset = (float)GD.RandRange(-100, 100); 
			 Vector3 pos1 = Vector3.Zero;
			 Vector3 pos2 = Vector3.Zero;
			 
			 if (highwayAxis == 0) 
			 {
				 pos1 = new Vector3(-halfSize + 5.0f, 0, offset);
				 pos2 = new Vector3(halfSize - 5.0f, 0, offset);
			 }
			 else 
			 {
				 pos1 = new Vector3(offset, 0, -halfSize + 5.0f);
				 pos2 = new Vector3(offset, 0, halfSize - 5.0f);
			 }
			 
			 CreateReinforcePoint($"Spawn_Player_{i}", pos1, p1Team, parentRegion);
			 CreateReinforcePoint($"Spawn_Enemy_{i}", pos2, p2Team, parentRegion);
		}
	}
	
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

	private void CreateRoadLines(Vector3 center, float length, float width, Node parent, bool rotated = false)
	{
		int segments = (int)(length / 4);
		var root = new Node3D();
		root.Name = "RoadLines";
		parent.AddChild(root);

		var mat = new StandardMaterial3D();
		mat.AlbedoColor = new Color(1, 1, 1); 

		for (int i = 0; i < segments; i++)
		{
			var meshInstance = new MeshInstance3D();
			var mesh = new PlaneMesh();
			mesh.Size = new Vector2(2, 0.5f);
			if (rotated)
			{
				 mesh.Size = new Vector2(0.5f, 2); 
			}
			meshInstance.Mesh = mesh;
			meshInstance.MaterialOverride = mat;
			
			if (rotated)
			{
				float z = -length / 2 + i * 4;
				meshInstance.Position = center + new Vector3(0, 0.08f, z);
			}
			else
			{
				float x = -length / 2 + i * 4;
				meshInstance.Position = center + new Vector3(x, 0.08f, 0);
			}
			root.AddChild(meshInstance);
		}
	}
	
	private void CreateStrip(string name, Vector3 pos, Vector3 size, Texture2D texture, Node parent, Vector2? uvScale = null)
	{
		var meshInstance = new MeshInstance3D();
		meshInstance.Name = name;
		var mesh = new BoxMesh();
		mesh.Size = size;
		
		var mat = new StandardMaterial3D();
		if (texture != null)
		{
			mat.AlbedoTexture = texture;
			if (uvScale.HasValue)
			{
				mat.Uv1Scale = new Vector3(uvScale.Value.X, uvScale.Value.Y, 1);
			}
		}
		else
		{
			 mat.AlbedoColor = new Color(0.5f, 0.5f, 0.5f); 
		}
		
		meshInstance.Mesh = mesh;
		meshInstance.Position = pos;
		meshInstance.MaterialOverride = mat;

		var staticBody = new StaticBody3D();
		var collisionShape = new CollisionShape3D();
		var shape = new BoxShape3D();
		shape.Size = mesh.Size;
		collisionShape.Shape = shape;
		staticBody.AddChild(collisionShape);
		meshInstance.AddChild(staticBody);
		
		parent.AddChild(meshInstance);
	}
	
	// Fallback for Color strips if needed
	private void CreateStrip(string name, Vector3 pos, Vector3 size, Color color, Node parent)
	{
		var meshInstance = new MeshInstance3D();
		meshInstance.Name = name;
		var mesh = new BoxMesh();
		mesh.Size = size;
		var mat = new StandardMaterial3D();
		mat.AlbedoColor = color;
		meshInstance.Mesh = mesh;
		meshInstance.Position = pos;

		var staticBody = new StaticBody3D();
		var collisionShape = new CollisionShape3D();
		var shape = new BoxShape3D();
		shape.Size = mesh.Size;
		collisionShape.Shape = shape;
		staticBody.AddChild(collisionShape);
		meshInstance.AddChild(staticBody);

		parent.AddChild(meshInstance);
	}

	// NEW: PlaneMesh-based terrain for proper UV orientation control
	private void CreatePlane(string name, Vector3 pos, Vector2 size, Texture2D texture, Node parent, Vector2? uvScale = null, float rotationDegrees = 0.0f, Color? tintColor = null)
	{
		var meshInstance = new MeshInstance3D();
		meshInstance.Name = name;
		var mesh = new PlaneMesh();
		mesh.Size = size;
		
		var mat = new StandardMaterial3D();
		if (texture != null)
		{
			mat.AlbedoTexture = texture;
			if (uvScale.HasValue)
			{
				mat.Uv1Scale = new Vector3(uvScale.Value.X, uvScale.Value.Y, 1);
			}
			
			// Apply color tint if provided (for crop variation)
			if (tintColor.HasValue)
			{
				mat.AlbedoColor = tintColor.Value;
			}
		}
		else
		{
			mat.AlbedoColor = tintColor ?? new Color(0.5f, 0.5f, 0.5f);
		}
		
		meshInstance.Mesh = mesh;
		meshInstance.Position = pos;
		meshInstance.MaterialOverride = mat;
		
		// Apply rotation around Y-axis for proper texture orientation
		if (rotationDegrees != 0.0f)
		{
			meshInstance.RotateY(Mathf.DegToRad(rotationDegrees));
		}

		// Collision (flat box shape)
		var staticBody = new StaticBody3D();
		var collisionShape = new CollisionShape3D();
		var shape = new BoxShape3D();
		shape.Size = new Vector3(size.X, 0.1f, size.Y); // Thin vertical collision
		collisionShape.Shape = shape;
		staticBody.AddChild(collisionShape);
		meshInstance.AddChild(staticBody);
		
		parent.AddChild(meshInstance);
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
		parent.AddChild(meshInstance);
	}

	private void CreateCylinder(string name, Vector3 pos, float radius, Texture2D texture, Node parent)
	{
		var meshInstance = new MeshInstance3D();
		meshInstance.Name = name;
		var mesh = new CylinderMesh();
		mesh.TopRadius = radius;
		mesh.BottomRadius = radius;
		mesh.Height = 0.1f;
		
		var mat = new StandardMaterial3D();
		if (texture != null)
		{
			mat.AlbedoTexture = texture;
			mat.Uv1Scale = new Vector3(radius/5.0f, radius/5.0f, 1);
		}
		else
		{
			mat.AlbedoColor = new Color(0, 0, 1);
		}
		
		meshInstance.MaterialOverride = mat;
		meshInstance.Mesh = mesh;
		meshInstance.Position = pos;
		parent.AddChild(meshInstance);
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
			Vector3 offset = new Vector3(GD.Randf() * 20 - 10, 0, GD.Randf() * 20 - 10);
			
			// Create garrisonable building
			var building = new GarrisonableBuilding();
			building.Position = center + offset;
			building.Name = $"Building_{i}";
			
			// Vary building size and capacity
			float heightVariation = (float)GD.RandRange(3, 8);
			Vector3 buildingSize = new Vector3(4, heightVariation, 4);
			
			// Capacity based on building size
			if (heightVariation <= 4) building.Capacity = 3;      // Small: 3 units
			else if (heightVariation <= 6) building.Capacity = 5;  // Medium: 5 units
			else building.Capacity = 8;                             // Large: 8 units
			
			var meshInstance = new MeshInstance3D();
			var mesh = new BoxMesh();
			mesh.Size = buildingSize;
			meshInstance.Mesh = mesh;
			meshInstance.Name = "Mesh";  // Required for GarrisonableBuilding to find and tint
			meshInstance.Position = new Vector3(0, buildingSize.Y / 2, 0);  // Center on ground
			meshInstance.MaterialOverride = mat;
			building.AddChild(meshInstance);

			var collisionShape = new CollisionShape3D();
			var shape = new BoxShape3D();
			shape.Size = buildingSize;
			collisionShape.Shape = shape;
			collisionShape.Position = new Vector3(0, buildingSize.Y / 2, 0);  // Center collision
			building.AddChild(collisionShape);
			
			root.AddChild(building);
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
			var staticBody = new StaticBody3D();
			Vector3 offset = new Vector3(GD.Randf() * 20 - 10, 2.0f, GD.Randf() * 20 - 10);
			staticBody.Position = center + offset;

			var meshInstance = new MeshInstance3D();
			var mesh = new CylinderMesh(); 
			mesh.TopRadius = 0.5f;
			mesh.BottomRadius = 1.0f;
			mesh.Height = 4.0f;
			meshInstance.Mesh = mesh;
			meshInstance.MaterialOverride = mat;
			staticBody.AddChild(meshInstance);
			
			var collisionShape = new CollisionShape3D();
			var shape = new CylinderShape3D();
			shape.Height = mesh.Height;
			shape.Radius = mesh.TopRadius; 
			collisionShape.Shape = shape;
			staticBody.AddChild(collisionShape);
			
			root.AddChild(staticBody);
		}
	}

	private void CreateReinforcePoint(string name, Vector3 pos, string team, Node parent)
	{
		var rp = new ReinforcePoint();
		rp.Name = name;
		rp.Position = pos;
		rp.Team = team;
		
		var meshInst = new MeshInstance3D();
		var mesh = new CylinderMesh();
		mesh.TopRadius = 0.5f;
		mesh.BottomRadius = 0.5f;
		mesh.Height = 3.0f;
		meshInst.Mesh = mesh;
		
		var mat = new StandardMaterial3D();
		mat.AlbedoColor = team == "Player" ? new Color(0, 0, 1) : new Color(1, 0, 0); 
		meshInst.MaterialOverride = mat;
		
		rp.AddChild(meshInst);
		
		parent.AddChild(rp);
	}

	private void CreateTown(int highwayAxis, float halfSize)
	{
		GD.Print("Generating Town...");
		Vector3 townCenter = Vector3.Zero;
		
		if (highwayAxis == 0) // Highway is East-West (X)
		{
			 townCenter = new Vector3(0, 0, 60); 
			 CreateStrip("TownAccessRoad", new Vector3(0, 0.05f, 30), new Vector3(10, 0.2f, 60), _texTownRoad, _regionTown, new Vector2(2, 6));
		}
		else // Highway is North-South (Z)
		{
			 townCenter = new Vector3(60, 0, 0); 
			 CreateStrip("TownAccessRoad", new Vector3(30, 0.05f, 0), new Vector3(60, 0.2f, 10), _texTownRoad, _regionTown, new Vector2(6, 2));
		}

		// Town Grid
		float blockSize = 20.0f;
		float streetWidth = 6.0f;
		
		for (int x = -2; x <= 1; x++)
		{
			for (int z = -2; z <= 1; z++)
			{
				float xPos = x * (blockSize + streetWidth) + (streetWidth/2.0f); 
				float zPos = z * (blockSize + streetWidth) + (streetWidth/2.0f);
				
				Vector3 blockPos = townCenter + new Vector3(xPos, 0, zPos);
				
				if (x == -1 && z == -1)
				{
					CreateChurch(blockPos, _regionTown);
				}
				else
				{
					CreateBlockCluster($"Block_{x}_{z}", blockPos, GD.RandRange(3, 5), new Color(0.6f, 0.4f, 0.2f), _regionTown);
				}
				
				CreateStrip($"Pavement_{x}_{z}", blockPos, new Vector3(blockSize, 0.2f, blockSize), new Color(0.5f, 0.5f, 0.5f), _regionTown);
				
				Vector3 streetEPos = blockPos + new Vector3(blockSize/2 + streetWidth/2, 0.02f, 0);
				CreateStrip($"Street_E_{x}_{z}", streetEPos, new Vector3(streetWidth, 0.1f, blockSize), _texTownRoad, _regionTown, new Vector2(1, 2));

				Vector3 streetSPos = blockPos + new Vector3(0, 0.02f, blockSize/2 + streetWidth/2);
				CreateStrip($"Street_S_{x}_{z}", streetSPos, new Vector3(blockSize + streetWidth, 0.1f, streetWidth), _texTownRoad, _regionTown, new Vector2(2, 1));
			}
		}
	}

	private void CreateChurch(Vector3 pos, Node parent)
	{
		// Create garrisonable building
		var building = new GarrisonableBuilding();
		building.Name = "Church";
		building.Position = pos;
		building.IsHighGround = true;  // Churches provide enhanced line of sight
		building.Capacity = 15;  // Can hold 15 infantry units
		parent.AddChild(building);

		// Church body mesh
		var body = new MeshInstance3D();
		var bodyMesh = new BoxMesh();
		bodyMesh.Size = new Vector3(10, 8, 15);
		body.Mesh = bodyMesh;
		body.Position = new Vector3(0, 4, 0);
		body.Name = "Mesh";  // Required for GarrisonableBuilding to find and tint
		var mat = new StandardMaterial3D();
		mat.AlbedoColor = new Color(0.8f, 0.8f, 0.9f); 
		body.MaterialOverride = mat;
		
		// Collision shape
		var shape = new CollisionShape3D();
		shape.Shape = new BoxShape3D { Size = bodyMesh.Size };
		building.AddChild(shape);
		building.AddChild(body);

		// Steeple base
		var steepleBase = new MeshInstance3D();
		var steepleMesh = new BoxMesh { Size = new Vector3(6, 12, 6) };
		steepleBase.Mesh = steepleMesh;
		steepleBase.Position = new Vector3(0, 6, 5); 
		steepleBase.MaterialOverride = mat;
		
		var shape2 = new CollisionShape3D();
		shape2.Shape = new BoxShape3D { Size = steepleMesh.Size };
		building.AddChild(shape2);
		building.AddChild(steepleBase);

		// Spire (decorative, no collision)
		var spire = new MeshInstance3D();
		var spireMesh = new CylinderMesh();
		spireMesh.TopRadius = 0.0f;
		spireMesh.BottomRadius = 3.0f;
		spireMesh.Height = 8.0f;
		spire.Mesh = spireMesh;
		spire.Position = new Vector3(0, 16, 5); 
		spire.MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.4f, 0.4f, 0.5f) }; 
		building.AddChild(spire);
	}

	private enum MapTileType { None, Field, Forest, Town, Lake, Road, Farm } 
	
	// Helper method to calculate forest cluster size using flood fill
	private int CalculateForestClusterSize(MapTileType[,] grid, bool[,] processed, int startX, int startZ)
	{
		int gridSize = grid.GetLength(0);
		int count = 0;
		
		List<Vector2I> toProcess = new List<Vector2I>();
		toProcess.Add(new Vector2I(startX, startZ));
		
		while (toProcess.Count > 0)
		{
			Vector2I tile = toProcess[0];
			toProcess.RemoveAt(0);
			
			// Skip if out of bounds or already processed
			if (tile.X < 0 || tile.X >= gridSize || tile.Y < 0 || tile.Y >= gridSize)
				continue;
			if (processed[tile.X, tile.Y])
				continue;
			if (grid[tile.X, tile.Y] != MapTileType.Forest)
				continue;
			
			// Mark as processed and count it
			processed[tile.X, tile.Y] = true;
			count++;
			
			// Add neighbors
			toProcess.Add(new Vector2I(tile.X + 1, tile.Y));
			toProcess.Add(new Vector2I(tile.X - 1, tile.Y));
			toProcess.Add(new Vector2I(tile.X, tile.Y + 1));
			toProcess.Add(new Vector2I(tile.X, tile.Y - 1));
		}
		
		return count;
	}

	private void CreateFarmingLandscape(float halfSize)
	{
		Vector3 lakePos = new Vector3(-halfSize + 60, 0.15f, -halfSize + 60); 
		CreateKidneyLake(lakePos, _regionField); 
		
		GD.Print("Generating Farming Landscape with Forests & Dirt Roads...");
		
		float fieldSize = 40.0f; 
		float hedgeProbability = 0.5f; 
		
		int gridMin = (int)(-halfSize / fieldSize);
		int gridMax = (int)(halfSize / fieldSize);
		int gridSize = gridMax - gridMin + 1;
		
		MapTileType[,] grid = new MapTileType[gridSize, gridSize];
		int gridOffset = -gridMin; 

		for (int x = 0; x < gridSize; x++)
		{
			for (int z = 0; z < gridSize; z++)
			{
				int worldIdxX = x - gridOffset;
				int worldIdxZ = z - gridOffset;
				Vector3 center = new Vector3(worldIdxX * fieldSize, 0, worldIdxZ * fieldSize);

				if (center.Length() < 70.0f) 
				{
					grid[x, z] = MapTileType.Town;
					continue;
				}

				if (center.DistanceTo(lakePos) < 50.0f)
				{
					grid[x, z] = MapTileType.Lake;
					continue;
				}

				// Check if tile is on highway
				bool onHighway = false;
				if (_highwayAxis == 0) // Highway runs East-West (along X-axis) at Z=0
				{
					// Check if tile center's Z coordinate is within highway width
					onHighway = Mathf.Abs(center.Z) < (_highwayWidth / 2.0f + fieldSize / 2.0f);
				}
				else // Highway runs North-South (along Z-axis) at X=0
				{
					// Check if tile center's X coordinate is within highway width
					onHighway = Mathf.Abs(center.X) < (_highwayWidth / 2.0f + fieldSize / 2.0f);
				}

				if (onHighway)
				{
					grid[x, z] = MapTileType.Road;
					continue;
				}

				grid[x, z] = MapTileType.Field;
			}
		}

		// Forests
		int paddocksSinceLastForest = 0;
		int nextForestThreshold = GD.RandRange(3, 10);
		
		for (int x = 0; x < gridSize; x++)
		{
			for (int z = 0; z < gridSize; z++)
			{
				if (grid[x, z] == MapTileType.Field)
				{
					paddocksSinceLastForest++;
					if (paddocksSinceLastForest >= nextForestThreshold)
					{
						int forestSize = GD.RandRange(1, 10);
						GrowForest(grid, x, z, forestSize);
						paddocksSinceLastForest = 0;
						nextForestThreshold = GD.RandRange(3, 10);
					}
				}
			}
		}

		// Render
		var matHedge = new StandardMaterial3D();
		matHedge.AlbedoColor = new Color(0.1f, 0.4f, 0.1f);
		
		// Crop color palette for field variation (simulating different crops)
		Color[] cropColors = new Color[]
		{
			new Color(0.4f, 0.7f, 0.3f),   // Green pasture
			new Color(0.65f, 0.6f, 0.35f),  // Wheat/tan
			new Color(0.45f, 0.35f, 0.25f), // Plowed earth/brown
			new Color(0.35f, 0.6f, 0.3f),   // Darker green (barley)
			new Color(0.55f, 0.7f, 0.4f),   // Light green
			new Color(0.7f, 0.65f, 0.4f)    // Golden/hay
		};
		
		Node parent = _regionField;

		// Track which forest tiles have been processed to calculate forest cluster sizes
		bool[,] processedForest = new bool[gridSize, gridSize];

		for (int x = 0; x < gridSize; x++)
		{
			for (int z = 0; z < gridSize; z++)
			{
				int worldIdxX = x - gridOffset;
				int worldIdxZ = z - gridOffset;
				Vector3 center = new Vector3(worldIdxX * fieldSize, 0, worldIdxZ * fieldSize);

				switch (grid[x, z])
				{
					case MapTileType.Forest:
						// Calculate forest cluster size to determine density
						string density = "medium";
						if (!processedForest[x, z])
						{
							int clusterSize = CalculateForestClusterSize(grid, processedForest, x, z);
							
							// Determine density based on cluster size
							if (clusterSize <= 3)
								density = "low"; // Small forests: 30-100 trees per tile
							else if (clusterSize >= 8)
								density = "high"; // Large forests: 400-1000 trees per tile
							// else medium: 100-400 trees per tile
						}
						
						CreatePlane($"ForestFloor_{x}_{z}", center + Vector3.Up * 0.05f, new Vector2(fieldSize, fieldSize), _texForest, parent, new Vector2(4, 4));
						CreateForestTile(center, fieldSize, parent, density);
						break;
						
					case MapTileType.Road:
						 CreatePlane($"C_Hwy_{x}_{z}", center + Vector3.Up * 0.05f, new Vector2(fieldSize, fieldSize), _texTownRoad, parent, new Vector2(4, 4));
						break;
						
					case MapTileType.Farm:
						CreateFarmTile(center, fieldSize, parent);
						break;
						
					case MapTileType.Field:
						// Apply random crop color for variation
						Color cropColor = cropColors[GD.RandRange(0, cropColors.Length - 1)];
						CreatePlane($"Field_{x}_{z}", center + Vector3.Up * 0.02f, new Vector2(fieldSize, fieldSize), _texGrass, parent, new Vector2(4, 4), 0.0f, cropColor);
						
						if (GD.Randf() < hedgeProbability)
						{
							 Vector3 edgePos = center + new Vector3(fieldSize/2, 0, 0);
							 CreateHedgerow(edgePos, new Vector3(0, 0, fieldSize), matHedge, parent);
						}
						if (GD.Randf() < hedgeProbability)
						{
							 Vector3 edgePos = center + new Vector3(0, 0, fieldSize/2);
							 CreateHedgerow(edgePos, new Vector3(fieldSize, 0, 0), matHedge, parent);
						}
						break;
				}
			}
		}
	}

	private void CreateFarmTile(Vector3 center, float fieldSize, Node parent)
	{
		// Garrisonable farmhouse
		var building = new GarrisonableBuilding();
		building.Name = "Farmhouse";
		building.Position = center + new Vector3(0, 3, 0);
		building.Capacity = 5;  // Can hold 5 infantry units
		parent.AddChild(building);
		
		var mesh = new BoxMesh();
		mesh.Size = new Vector3(8, 6, 10);
		var house = new MeshInstance3D();
		house.Mesh = mesh;
		house.Name = "Mesh";  // Required for GarrisonableBuilding to find and tint
		var mat = new StandardMaterial3D();
		mat.AlbedoColor = new Color(0.8f, 0.7f, 0.6f); 
		house.MaterialOverride = mat;
		
		var shape = new CollisionShape3D();
		shape.Shape = new BoxShape3D{Size=mesh.Size};
		building.AddChild(shape);
		building.AddChild(house);
		
		// Silo (non-garrisonable)
		var silo = new MeshInstance3D();
		var sMesh = new CylinderMesh();
		sMesh.TopRadius = 2.5f; sMesh.BottomRadius = 2.5f; sMesh.Height = 10.0f;
		silo.Mesh = sMesh;
		silo.Position = center + new Vector3(8, 5, 8);
		silo.MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.6f, 0.6f, 0.65f) };
		var sCol = new StaticBody3D();
		sCol.AddChild(new CollisionShape3D { Shape = new CylinderShape3D{Radius=2.5f, Height=10.0f}});
		silo.AddChild(sCol);
		parent.AddChild(silo);

		int edge = GD.RandRange(0, 3); 
		Vector3 roadSize = Vector3.Zero;
		Vector3 roadPos = Vector3.Zero;
		
		if (edge == 0 || edge == 2) 
		{
			roadSize = new Vector3(4.0f, 0.1f, fieldSize/2); 
			float zOffset = (edge == 0) ? -fieldSize/4 : fieldSize/4;
			roadPos = center + new Vector3(0, 0.05f, zOffset);
		}
		else 
		{
			roadSize = new Vector3(fieldSize/2, 0.1f, 4.0f);
			float xOffset = (edge == 3) ? -fieldSize/4 : fieldSize/4;
			roadPos = center + new Vector3(xOffset, 0.05f, 0);
		}
		
		CreateStrip("DirtRoad", roadPos, roadSize, _texDirtRoad, parent, new Vector2(1, 4));
	}

	private void GrowForest(MapTileType[,] grid, int startX, int startZ, int targetSize)
	{
		int gridSize = grid.GetLength(0);
		int currentSize = 0;
		
		List<Vector2I> openList = new List<Vector2I>();
		openList.Add(new Vector2I(startX, startZ));
		
		while (currentSize < targetSize && openList.Count > 0)
		{
			int idx = GD.RandRange(0, openList.Count - 1);
			Vector2I tile = openList[idx];
			openList.RemoveAt(idx);
			
			if (tile.X >= 0 && tile.X < gridSize && tile.Y >= 0 && tile.Y < gridSize)
			{
				if (grid[tile.X, tile.Y] == MapTileType.Field)
				{
					grid[tile.X, tile.Y] = MapTileType.Forest;
					currentSize++;
					
					openList.Add(new Vector2I(tile.X + 1, tile.Y));
					openList.Add(new Vector2I(tile.X - 1, tile.Y));
					openList.Add(new Vector2I(tile.X, tile.Y + 1));
					openList.Add(new Vector2I(tile.X, tile.Y - 1));
				}
			}
		}
	}

	private void CreateForestTile(Vector3 center, float size, Node parent, string density = "medium")
	{
		// Calculate tree count based on density and tile size
		int treeCount;
		float spacing;
		
		switch (density.ToLower())
		{
			case "low":
				treeCount = GD.RandRange(30, 100);
				spacing = 3.0f; // More spread out
				break;
			case "high":
				treeCount = GD.RandRange(400, 1000);
				spacing = 1.0f; // Very dense
				break;
			case "medium":
			default:
				treeCount = GD.RandRange(100, 400);
				spacing = 1.5f; // Moderate density
				break;
		}
		
		var mat = new StandardMaterial3D();
		mat.AlbedoColor = new Color(0, 0.5f, 0); 

		for (int i = 0; i < treeCount; i++)
		{
			// Use tighter spacing for denser forests
			float rX = (float)GD.RandRange(-size/2 + spacing, size/2 - spacing);
			float rZ = (float)GD.RandRange(-size/2 + spacing, size/2 - spacing);
			Vector3 pos = center + new Vector3(rX, 0, rZ);
			CreateTree(pos, mat, parent);
		}
	}

	private void CreateHedgerow(Vector3 center, Vector3 direction, StandardMaterial3D mat, Node parent)
	{
		float length = direction.Length();
		Vector3 dirNorm = direction.Normalized();
		int treeCount = (int)(length / 6.0f); // Increased from 4.0f for wider spacing
		
		for(int i=0; i<treeCount; i++)
		{
			if (GD.Randf() > 0.65f) continue; // Reduced from 0.8f for more gaps
			
			float d = (i * 6.0f) - (length/2.0f); // Match spacing increase
			Vector3 pos = center + dirNorm * d;
			
			// Increased random offset for more irregular appearance
			pos += new Vector3(GD.Randf()*6-3, 0, GD.Randf()*6-3);
			
			CreateTree(pos, mat, parent);
		}
	}

	private void CreateTree(Vector3 pos, StandardMaterial3D mat, Node parent)
	{
		var staticBody = new StaticBody3D();
		staticBody.Position = pos;

		var meshInstance = new MeshInstance3D();
		var mesh = new CylinderMesh(); 
		mesh.TopRadius = 0.5f;
		mesh.BottomRadius = 0.8f;
		mesh.Height = 3.0f + (float)GD.RandRange(0, 2);
		meshInstance.Mesh = mesh;
		meshInstance.MaterialOverride = mat;
		staticBody.AddChild(meshInstance);
		
		var collisionShape = new CollisionShape3D();
		var shape = new CylinderShape3D();
		shape.Height = mesh.Height;
		shape.Radius = mesh.TopRadius;
		collisionShape.Shape = shape;
		staticBody.AddChild(collisionShape);
		
		parent.AddChild(staticBody);
	}

	private void CreateKidneyLake(Vector3 pos, Node parent)
	{
		var root = new Node3D();
		root.Name = "KidneyLake";
		root.Position = pos;
		parent.AddChild(root);
		
		CreateCylinder("LakePart1", Vector3.Zero, 20.0f, _texLake, root);
		CreateCylinder("LakePart2", new Vector3(15, 0, 10), 15.0f, _texLake, root);
		CreateCylinder("LakePart3", new Vector3(8, 0, 5), 18.0f, _texLake, root);
	}

	private void CreateCaptureZones(float halfSize, Node parent)
	{
		float edgeInset = 40.0f;
		CreateCaptureZone("Zone_North", new Vector3(0, 0, -halfSize + edgeInset), 2, parent);
		CreateCaptureZone("Zone_South", new Vector3(0, 0, halfSize - edgeInset), 2, parent);
		CreateCaptureZone("Zone_East", new Vector3(halfSize - edgeInset, 0, 0), 2, parent);
		CreateCaptureZone("Zone_West", new Vector3(-halfSize + edgeInset, 0, 0), 2, parent);

		var church = parent.FindChild("Church", true, false) as Node3D;
		Vector3 townZonePos = Vector3.Zero;
		if (church != null) townZonePos = church.GlobalPosition;
		else townZonePos = new Vector3(50, 0, 50); 

		CreateCaptureZone("Zone_Town", townZonePos + new Vector3(15,0,0), 3, parent); 
	}

	private void CreateCaptureZone(string name, Vector3 pos, int points, Node parent)
	{
		var zone = new CaptureZone();
		zone.Name = name;
		zone.Position = pos;
		zone.PointsPerSecond = points; 
		
		var collisionShape = new CollisionShape3D();
		var shape = new CylinderShape3D();
		shape.Radius = 15.0f;
		shape.Height = 2.0f;
		collisionShape.Shape = shape;
		zone.AddChild(collisionShape);
		
		var meshInstance = new MeshInstance3D();
		meshInstance.Name = "MeshInstance3D";
		var mesh = new CylinderMesh();
		mesh.TopRadius = 15.0f;
		mesh.BottomRadius = 15.0f;
		mesh.Height = 0.5f;
		meshInstance.Mesh = mesh;
		var mat = new StandardMaterial3D();
		mat.AlbedoColor = new Color(1, 1, 0, 0.3f);
		mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
		meshInstance.MaterialOverride = mat;
		zone.AddChild(meshInstance);
		
		parent.AddChild(zone);
	}
}
