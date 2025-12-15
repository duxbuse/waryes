using Godot;
using WarYes.Data;
using System.Collections.Generic;

public partial class Unit : CharacterBody3D
{
    public UnitData Data;
    public bool IsMoving = false;
    
    private NavigationAgent3D _navAgent;
    private MeshInstance3D _visuals;
    private CollisionShape3D _collisionShape;
    private MeshInstance3D _selectionData;
    private Node3D _visualRoot; // Visual pivot for altitude

    public override void _Ready()
    {
        _navAgent = new NavigationAgent3D();
        _navAgent.PathDesiredDistance = 1.0f;
        _navAgent.TargetDesiredDistance = 1.0f;
        
        // Enable Avoidance
        _navAgent.AvoidanceEnabled = true;
        _navAgent.Radius = 1.0f; 
        _navAgent.NeighborDistance = 10.0f;
        _navAgent.MaxSpeed = 20.0f;

        _navAgent.VelocityComputed += OnVelocityComputed;
        AddChild(_navAgent);
    }

    // Combat
    public int Health { get; private set; }
    private int _maxHealth;
    public string Team { get; set; } = "Player"; // "Player" or "Enemy"
    private List<Weapon> _weapons = new List<Weapon>();
    private float _scanTimer = SCAN_INTERVAL; // Start ready to scan
    private const float SCAN_INTERVAL = 0.5f;
    
    // Health Bar
    private MeshInstance3D _healthBarBackground;
    private Node3D _healthBarRoot;
    private bool _isSelected = false;

    public void Initialize(UnitData data)
    {
        Data = data;
        // Do NOT overwrite Name here, as UnitManager assigns a unique name (e.g. "enemy_tank_1")
        // Name = data.Id; 
        
        Health = Data.Health > 0 ? Data.Health : 10; // Default if 0
        _maxHealth = Health; // Store for health bar calculation
        
        // Team Logic
        if (Name.ToString().ToLower().Contains("enemy") || (Data.Id.ToLower().Contains("enemy")))
        {
            Team = "Enemy";
        }
        else
        {
            Team = "Player";
        }
        
        float speedKmh = Data.Speed.Road > 0 ? Data.Speed.Road : 30.0f;
        float speedMs = speedKmh / 3.6f;
        
        // Visual Logic & Speed Clamping
        bool isAir = speedMs > 300.0f / 3.6f || Data.Id.Contains("gunship") || Data.Id.Contains("air");
        if (isAir)
        {
            speedMs = Mathf.Min(speedMs, 15.0f); // Cap air speed to ~54km/h for visibility (User request)
        }
        
        _navAgent.MaxSpeed = speedMs;
        
        CreateVisuals();
        
        CreateVisuals();
        
        // Initialize Weapons
        _weapons.Clear();
        
        if (Data.Weapons != null && Data.Weapons.Length > 0)
        {
            foreach (var wData in Data.Weapons)
            {
                var w = new Weapon();
                AddChild(w);
                w.Initialize(this, wData.WeaponId);
                _weapons.Add(w);
            }
        }
        else
        {
            // Default Weapon
            var w = new Weapon();
            AddChild(w);
            // Force tanks to have cannons for prototype fun
            string weaponId = "rifle";
            if (Data.Id.Contains("mbt") || Data.Id.Contains("tank")) weaponId = "cannon";
            
            w.Initialize(this, weaponId);
            _weapons.Add(w);
        }
        
        IsCommander = Data.IsCommander;
        if (IsCommander)
        {
             CreateCommanderVisuals();
        }
        
        // Setup Veterancy Visuals (Buffered icon)
        CreateVeterancyIcon();
        
        GD.Print($"Unit {Name} initialized: Team={Team}, Weapons={_weapons.Count}, Health={Health}, Commander={IsCommander}");
    }

    public bool IsCommander { get; private set; }
    private Node3D _commanderAura;
    private Sprite3D _veterancyIcon;

    private void CreateCommanderVisuals()
    {
        if (_commanderAura != null) return;
        
        _commanderAura = new Node3D();
        _commanderAura.Name = "CommanderAura";
        _visualRoot.AddChild(_commanderAura);
        
        // 20m Radius Ring (40% of previous 50m)
        float radius = 20.0f;
        
        var meshInst = new MeshInstance3D();
        var torus = new TorusMesh();
        torus.InnerRadius = radius - 0.5f; 
        torus.OuterRadius = radius;
        meshInst.Mesh = torus;
        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(1, 1, 1, 0.3f); // Faint White
        mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        meshInst.MaterialOverride = mat;
        
        _commanderAura.AddChild(meshInst);
    }
    
    private void CreateVeterancyIcon()
    {
         if (_veterancyIcon != null) return;
         
        // Simple Billboard Sprite above unit
        _veterancyIcon = new Sprite3D();
        _veterancyIcon.Name = "VetIcon";
        // Create a simple chevron texture procedurally if asset missing
        // For now, let's use a placeholder or draw one
        var image = Image.Create(32, 32, false, Image.Format.Rgba8);
        // Draw Chevron... crude
        for(int x=0; x<32; x++)
            for(int y=0; y<32; y++)
            {
                 // V shape logic...
                 // y = abs(x-16) roughly
                 int centerDist = Mathf.Abs(x - 16);
                 if (y > centerDist && y < centerDist + 4) 
                     image.SetPixel(x, y, new Color(1, 1, 1)); // Top V
                 if (y > centerDist + 8 && y < centerDist + 12)
                     image.SetPixel(x, y, new Color(1, 1, 1)); // Bottom V
            }
            
        var tex = ImageTexture.CreateFromImage(image);
        _veterancyIcon.Texture = tex;
        _veterancyIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _veterancyIcon.PixelSize = 0.02f;
        _veterancyIcon.Position = new Vector3(0, 4, 0); // Above health bar
        _veterancyIcon.Visible = false; // Hidden by default
        
        AddChild(_veterancyIcon);
    }
    
    private void UpdateVeterancyStatus()
    {
         if (IsCommander) 
         {
             if (_veterancyIcon != null) _veterancyIcon.Visible = false; 
             return; 
         }
         
         if (UnitManager.Instance == null) return;
         
         bool buffed = false;
         foreach(var u in UnitManager.Instance.GetActiveUnits())
         {
             if (u == this) continue;
             if (u.IsCommander && u.Team == this.Team)
             {
                 // Check 20m radius (20*20 = 400)
                 if (GlobalPosition.DistanceSquaredTo(u.GlobalPosition) < 400.0f)
                 {
                     buffed = true;
                     break;
                 }
             }
         }
         
         if (_veterancyIcon != null) _veterancyIcon.Visible = buffed;
    }
    
    private void CreateVisuals()
    {
        // Create Visual Root (Visual Pivot)
        if (GetNodeOrNull("VisualRoot") == null)
        {
            _visualRoot = new Node3D();
            _visualRoot.Name = "VisualRoot";
            AddChild(_visualRoot);
        }
        else
        {
            _visualRoot = GetNode<Node3D>("VisualRoot");
        }
        
        // Create Mesh
        if (_visualRoot.GetNodeOrNull("Mesh") == null)
        {
            _visuals = new MeshInstance3D();
            _visuals.Name = "Mesh";
            var mesh = new PrismMesh(); // Wedge shape to indicate facing
            mesh.Size = new Vector3(2, 2, 2); 
            // Rotate the mesh so the "point" faces forward (-Z is forward in Godot, Prism points up +Y by default)
            // Actually PrismMesh default: Triangle along X-axis? No, it points up Y.
            // We want it to point along -Z.
            // Let's use a BoxMesh and taper it, or just rotate the prism.
            // PrismMesh properties: LeftToRight is X. Up is Y. Depth is Z.
            // If we rotate -90 X, it points along Z.
            
            _visuals.Mesh = mesh;
            _visuals.RotationDegrees = new Vector3(-90, 0, 0); // Point forward (-Z) ?? 
            // Default Prism points UP (+Y). Rotating -90 on X makes it point Forward (-Z) if we assume standard orientation.
            // Let's test. If backwards, +90.
            
            _visualRoot.AddChild(_visuals);
        }
        else
        {
             _visuals = _visualRoot.GetNode<MeshInstance3D>("Mesh");
        }
        
        // Coloring Logic
        var material = new StandardMaterial3D();
        
        // Robust detection
        bool isEnemy = Team == "Enemy";
        bool isAir = _navAgent.MaxSpeed > 100.0f / 3.6f || Data.Id.Contains("gunship"); // Recalculate or store isAir
        // Actually let's just re-derive or checking Speed/Fuel
        isAir = Data.Id.Contains("gunship") || Data.Id.Contains("air") || Data.Id.Contains("jet") || (Data.Speed.Road > 100 && !Data.Fuel.HasValue); 
        // Note: UnitData logic is a bit loose, relying on ID is safest for prototype.
        
        bool isVehicle = Data.Fuel.HasValue || Data.Id.Contains("tank") || Data.Id.Contains("walker") || Data.Id.Contains("mbt");
        
        if (isEnemy)
        {
             if (isAir) material.AlbedoColor = new Color(1, 0.4f, 0.7f); // Pink (Enemy Air)
             else if (isVehicle) material.AlbedoColor = new Color(1, 0, 0); // Red (Enemy Vehicle)
             else material.AlbedoColor = new Color(0.5f, 0, 0.5f); // Purple (Enemy Infantry)
        }
        else
        {
             if (isAir)
             {
                 material.AlbedoColor = new Color(1, 0.5f, 0); // Orange (Friendly Air)
                 _visualRoot.Position = new Vector3(0, 8, 0); 
             }
             else if (isVehicle)
             {
                 material.AlbedoColor = new Color(0, 1, 0); // Green (Friendly Vehicle)
             }
             else
             {
                 material.AlbedoColor = new Color(0, 0, 1); // Blue (Friendly Infantry)
             }
        }
        
        _visuals.MaterialOverride = material;

        // Collision Logic
        if (GetNodeOrNull("CollisionShape3D") == null)
        {
            _collisionShape = new CollisionShape3D();
            _collisionShape.Name = "CollisionShape3D";
            var shape = new BoxShape3D(); 
            shape.Size = new Vector3(2, 2, 2);
            _collisionShape.Shape = shape;
            AddChild(_collisionShape);
        }
        
        // Vision Visualizer
        if (GetNodeOrNull("VisionVisualizer") == null)
        {
            var vis = new VisionVisualizer();
            vis.Name = "VisionVisualizer";
            AddChild(vis);
        }
        
        // Selection Ring
        CreateSelectionRing();
        
        // Health Bar
        CreateHealthBar();
    }
    
    private Sprite3D _healthBarBg;
    private Sprite3D _healthBarFg;

    private void CreateHealthBar()
    {
        if (_healthBarRoot != null) return;
        
        _healthBarRoot = new Node3D();
        _healthBarRoot.Name = "HealthBar";
        _healthBarRoot.TopLevel = true; 
        _visualRoot.AddChild(_healthBarRoot);
        
        // Create 1x1 White Texture
        var image = Image.Create(1, 1, false, Image.Format.Rgb8);
        image.SetPixel(0, 0, new Color(1, 1, 1));
        var texture = ImageTexture.CreateFromImage(image);
        
        // Background Sprite
        _healthBarBg = new Sprite3D();
        _healthBarBg.Name = "BG";
        _healthBarBg.Texture = texture;
        _healthBarBg.Modulate = new Color(0, 0, 0); // Black
        _healthBarBg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _healthBarBg.PixelSize = 0.01f; // Standardize pixel size
        // Size = TextureSize * PixelSize. 1px * 0.01 = 0.01m.
        // We want 2m width, 0.5m height.
        // Scale = Target / Base.
        _healthBarBg.Scale = new Vector3(2.0f / 0.01f, 0.5f / 0.01f, 1);
        _healthBarBg.RenderPriority = 10;
        _healthBarBg.NoDepthTest = true; // Optional: ensure it draws on top of unit? No, might clip terrain.
        _healthBarRoot.AddChild(_healthBarBg);
        
        // Foreground Sprite
        _healthBarFg = new Sprite3D();
        _healthBarFg.Name = "FG";
        _healthBarFg.Texture = texture;
        _healthBarFg.Modulate = new Color(0, 1, 0); // Green
        _healthBarFg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _healthBarFg.PixelSize = 0.01f;
        _healthBarFg.RenderPriority = 11; // Draw over BG
        _healthBarFg.NoDepthTest = true;
        _healthBarRoot.AddChild(_healthBarFg);
        
        _healthBarRoot.Visible = false;
    }
    
    private void UpdateHealthBar()
    {
        if (_healthBarBg == null || _healthBarFg == null) return;
        
        float healthPercent = (float)Health / _maxHealth;
        
        // Hide at full health unless selected
        if (healthPercent >= 1.0f && !_isSelected)
        {
            _healthBarRoot.Visible = false;
            return;
        }
        
        _healthBarRoot.Visible = true;
        
        // Update Color
        if (healthPercent > 0.5f) _healthBarFg.Modulate = new Color(0, 1, 0); // Green
        else if (healthPercent > 0.25f) _healthBarFg.Modulate = new Color(1, 1, 0); // Yellow
        else _healthBarFg.Modulate = new Color(1, 0, 0); // Red
        
        // Update Scale for Fill
        // Base Width = 2.0m. BG is 2.0m.
        // FG Width = 2.0m * healthPercent.
        // PixelSize is 0.01. Base Texture is 1px. Base Size 0.01m.
        // Scale X = TargetWidth / 0.01
        float targetWidth = 2.0f * healthPercent;
        float scaleX = targetWidth / 0.01f;
        float scaleY = 0.5f / 0.01f; // Height 0.5m
        
        _healthBarFg.Scale = new Vector3(scaleX, scaleY, 1);
        
        // Left Align Logic
        // Center of BG is (0,0). Width 2.0. Left Edge is -1.0.
        // Center of FG (width W) is usually 0. We want its Left Edge at -1.0.
        // FG Left Edge = PosX - (W/2).
        // -1.0 = PosX - (targetWidth / 2).
        // PosX = -1.0 + (targetWidth / 2).
        
        float posX = -1.0f + (targetWidth / 2.0f);
        // Note: For Billboard Enabled sprites, changing Position might affect billboard pivot?
        // Sprite3D pivot is center by default. This math assumes center pivot.
        
        _healthBarFg.Position = new Vector3(posX, 0, 0);
    }
    
    private void CreateSelectionRing()
    {
        if (_visualRoot.GetNodeOrNull("SelectionRing") != null)
        {
            _selectionData = _visualRoot.GetNode<MeshInstance3D>("SelectionRing");
            _selectionData.Visible = false;
            return;
        }

        _selectionData = new MeshInstance3D();
        _selectionData.Name = "SelectionRing";
        
        var torus = new TorusMesh();
        torus.InnerRadius = 1.5f;
        torus.OuterRadius = 1.7f;
        _selectionData.Mesh = torus;
        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(1, 1, 1);
        mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        _selectionData.MaterialOverride = mat;
        
        _selectionData.Visible = false;
        _visualRoot.AddChild(_selectionData);
    }

    public void TakeDamage(int amount)
    {
        Health -= amount;
        GD.Print($"{Name} took {amount} damage. HP: {Health}");
        
        UpdateHealthBar();
        
        if (Health <= 0)
        {
            Die();
        }
    }
    
    private void Die()
    {
        GD.Print($"{Name} destroyed!");
        // Visuals? Explosion?
        // Remove from selection
        if (_selectionData != null && _selectionData.Visible)
        {
            // SelectionManager handles cleanup via checking IsQueuedForDeletion usually
        }
        QueueFree();
    }

    public override void _PhysicsProcess(double delta)
    {
        // Combat Loop
        // Combat Loop
        // Combat Loop
        // Scanning (Low Frequency)
        _scanTimer -= (float)delta;
        if (_scanTimer <= 0)
        {
            _scanTimer = SCAN_INTERVAL;
            ScanAndFire(); 
        }
        
        // Update Aim Indicators (High Frequency)
        UpdateAimIndicator();
        
        // Movement Logic
        if (!IsMoving) return;
        if (_navAgent.IsNavigationFinished())
        {
            IsMoving = false;
            Velocity = Vector3.Zero;
            return;
        }

        Vector3 currentAgentPosition = GlobalTransform.Origin;
        Vector3 nextPathPosition = _navAgent.GetNextPathPosition();
        
        Vector3 newVelocity = (nextPathPosition - currentAgentPosition).Normalized();
        newVelocity *= _navAgent.MaxSpeed;
        _navAgent.Velocity = newVelocity;
    }
    
    // Combat Aiming
    private List<MeshInstance3D> _aimIndicators = new List<MeshInstance3D>();
    private Node3D _aimIndicatorRoot;

    private void CreateAimIndicator()
    {
        if (_aimIndicatorRoot != null) return;

        _aimIndicatorRoot = new Node3D();
        _aimIndicatorRoot.Name = "AimIndicator";
        // _aimIndicatorRoot.Position = ...
        _aimIndicatorRoot.TopLevel = true; // Decouple transform
        _visualRoot.AddChild(_aimIndicatorRoot);
        
        _aimIndicators.Clear();
        
        int count = _weapons.Count;
        float baseRadiusOut = 0.5f;
        float thickness = 0.15f;
        
        for (int i = 0; i < count; i++)
        {
            // Outer first
            float outR = baseRadiusOut - (i * (thickness + 0.05f));
            float inR = outR - thickness;
            
            if (inR < 0.05f) inR = 0.05f; // Clamp
            
            var meshInst = new MeshInstance3D();
            meshInst.Name = $"Ring_{i}";
            meshInst.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
            
            var quad = new QuadMesh();
            quad.Size = new Vector2(2, 2); // Texture space
            meshInst.Mesh = quad;
            
            var mat = new ShaderMaterial();
            mat.Shader = GD.Load<Shader>("res://art/shaders/AimIndicator.gdshader");
            mat.SetShaderParameter("inner_radius", inR); // Shader works in 0.5 space?
            // UV is 0..1 centered at 0.5. Dist is 0..0.5.
            // So Radius should be 0..0.5
            mat.SetShaderParameter("outer_radius", outR);
            // Default color Green
            mat.SetShaderParameter("fill_color", new Color(0, 1, 0));
            mat.SetShaderParameter("back_color", new Color(0, 0, 0, 0.2f)); // Faint background
            
            // Billboard mode? Shader "render_mode unshaded" is set. 
            // Can't set Billboard on ShaderMaterial easily without shader code.
            // But we can script rotation same as health bar.
            
            meshInst.MaterialOverride = mat;
            
            _aimIndicatorRoot.AddChild(meshInst);
            _aimIndicators.Add(meshInst);
        }
    }
    
    private void UpdateAimIndicator()
    {
        if (_aimIndicatorRoot == null) CreateAimIndicator();
        _aimIndicatorRoot.Visible = false;
        
        for (int i = 0; i < _weapons.Count; i++)
        {
            if (i >= _aimIndicators.Count) break;
            var w = _weapons[i];
            var mesh = _aimIndicators[i];
            var mat = mesh.MaterialOverride as ShaderMaterial;
            if (mat == null) continue;
            
            bool isActive = false;
            float progress = 0.0f;
            Color color = new Color(1, 1, 1, 0.2f); // Default faint
            
            // Check State
            if (w.CurrentTarget != null)
            {
                 // Aiming or Firing/Ideal
                 if (w.CurrentAimTimer > 0)
                 {
                     // Aiming
                     float total = w.AimTime;
                     if (total > 0) progress = 1.0f - (w.CurrentAimTimer / total);
                     else progress = 1.0f;
                     
                     color = new Color(0, 1, 0); // Green
                     isActive = true;
                 }
                 else if (w.Cooldown > 0)
                 {
                     // Reloading
                     float total = (w.FireRate > 0) ? (1.0f / w.FireRate) : 1.0f;
                     progress = 1.0f - (w.Cooldown / total); // Fill up as reload completes? Or deplete?
                     // Usually "Reload Bar" fills up.
                     
                     color = new Color(0, 0.5f, 1.0f); // Blue
                     isActive = true;
                 }
                 else
                 {
                     // Ready to fire (waiting for cycle or target)
                     progress = 1.0f;
                     color = new Color(0, 1, 0);
                     isActive = true;
                 }
            }
            else
            {
                // No target - Idle
                progress = 0.0f;
                isActive = false;
            }
            
            if (isActive) _aimIndicatorRoot.Visible = true;
            
            mat.SetShaderParameter("progress", progress);
            mat.SetShaderParameter("fill_color", color);
        }
    }

    private void ScanAndFire()
    {
       // Find best target for EACH weapon?
       // Optimization: Find ONE best target for unit, engage with all compatible weapons.
       // Usually RTS units fire all guns at main target, or secondary guns at others.
       // Prototype: Main Target.
       
       Unit bestTarget = FindBestTarget();
       
       foreach (var w in _weapons)
       {
           if (bestTarget != null)
           {
               if (CheckLineOfSight(bestTarget)) // Simple check
               {
                   w.Engage(bestTarget);
               }
               else
               {
                   w.StopEngaging();
               }
           }
           else
           {
               w.StopEngaging();
           }
       }
    }
    
    private Unit FindBestTarget()
    {
        // Simple global search
        if (UnitManager.Instance == null) return null;
        
        float maxRange = 0;
        foreach(var w in _weapons) if(w.Range > maxRange) maxRange = w.Range;
        float rangeSq = maxRange * maxRange;

        Unit best = null;
        float bestDistSq = rangeSq;

        foreach (var other in UnitManager.Instance.GetActiveUnits())
        {
            if (other == null || !IsInstanceValid(other) || other.IsQueuedForDeletion()) continue;
            if (other == this || other.Team == this.Team) continue;

            float distSq = GlobalPosition.DistanceSquaredTo(other.GlobalPosition);
            if (distSq < bestDistSq)
            {
                 best = other;
                 bestDistSq = distSq;
            }
        }
        return best;
    }
    
    // Extracted for cleanliness
    private bool CheckLineOfSight(Unit other)
    {
         var spaceState = GetWorld3D().DirectSpaceState;
         var from = GlobalPosition + Vector3.Up * 2;
         var to = other.GlobalPosition + Vector3.Up * 2;
         var query = PhysicsRayQueryParameters3D.Create(from, to, 0xFFFFFFFF, new Godot.Collections.Array<Godot.Rid> { GetRid() }); 
         var result = spaceState.IntersectRay(query);
         if (result.Count == 0) return true;
         if (result["collider"].As<Node>() == other || (result["collider"].As<Node>() is CollisionShape3D cs && cs.GetParent() == other)) return true;
         return false;
    }
    
    public void SetSelected(bool selected)
    {
        _isSelected = selected;
        if (_selectionData != null)
        {
            _selectionData.Visible = selected;
        }
        UpdateHealthBar();
    }
    
    public void MoveTo(Vector3 position)
    {
        _navAgent.TargetPosition = position;
        IsMoving = true;
    }

    private float speedMsFromKmh(float kmh) => kmh / 3.6f;

    private void OnVelocityComputed(Vector3 safeVelocity)
    {
        bool isVehicle = Data.Fuel.HasValue;
        bool isAir = speedMsFromKmh(Data.Speed.Road) > 300.0f / 3.6f;
        
        if (safeVelocity.LengthSquared() <= 0.01f)
        {
             Velocity = Vector3.Zero;
             MoveAndSlide();
             return;
        }

        if (isVehicle && !isAir)
        {
            // Tank Turn Logic with Rotation Speed
            Vector3 lookTarget = GlobalPosition + safeVelocity;
            Vector3 direction = (lookTarget - GlobalPosition).Normalized();
            
            Vector3 currentForward = -GlobalTransform.Basis.Z;
            float angle = currentForward.AngleTo(direction); // Always positive (0..Pi)
            
            // Get Rotation Speed from Data or Default
            float rotSpeedDeg = Data.Speed.RotationSpeed.HasValue ? Data.Speed.RotationSpeed.Value : 90.0f; // Default 90 deg/s
            float rotSpeedRad = Mathf.DegToRad(rotSpeedDeg);
            float maxRotStep = rotSpeedRad * (float)GetPhysicsProcessDeltaTime();
            
            if (angle > 0.01f) // Needs turning
            {
                // Determine turn direction (Left or Right) using Cross Product
                Vector3 cross = currentForward.Cross(direction);
                float sign = (cross.Y > 0) ? 1.0f : -1.0f; // Y-up axis, +Y cross means target is left
                
                // Cap rotation
                float rotAmount = Mathf.Min(angle, maxRotStep);
                
                // Apply rotation
                RotateY(rotAmount * sign);
                
                // Check if we are facing close enough to move
                if (Mathf.Abs(angle) > Mathf.DegToRad(15.0f))
                {
                     // Stop moving until facing
                     Velocity = Vector3.Zero;
                }
                else
                {
                     // Move
                     Velocity = safeVelocity;
                }
            }
            else
            {
                // Faced correctly
                Velocity = safeVelocity;
            }
        }
        else
        {
            // Infantry / Air - Instant turn
            Velocity = safeVelocity;
            if (Velocity.LengthSquared() > 0.1f)
            {
                 Vector3 lookTarget = GlobalPosition + Velocity;
                 if (GlobalPosition.DistanceSquaredTo(lookTarget) > 0.001f)
                 {
                     LookAt(lookTarget, Vector3.Up);
                 }
            }
        }

        MoveAndSlide();
    }

    public override void _Process(double delta)
    {
        // Low freq update for visuals?
        // Let's do every frame for smooth popping for now, or use timer
        UpdateVeterancyStatus();

        // Update TopLevel Positions manually
        if (_healthBarRoot != null && _healthBarRoot.Visible)
        {
            _healthBarRoot.GlobalPosition = GlobalPosition + new Vector3(0, 2.5f, 0);
            
            // Explicitly reset rotation to ensure billboard works from Identity
            _healthBarRoot.GlobalRotation = Vector3.Zero;
            
            // Scaling logic (if any)
            _healthBarRoot.Scale = Vector3.One; 
        }

        if (_aimIndicatorRoot != null && _aimIndicatorRoot.Visible)
        {
            _aimIndicatorRoot.GlobalPosition = GlobalPosition + new Vector3(0, 3.5f, 0);
            
            // Manual Billboard for Aim Indicator to prevent "disappearing"
            // LookAt camera
            var camera = GetViewport()?.GetCamera3D();
            if (camera != null)
            {
                _aimIndicatorRoot.LookAt(camera.GlobalPosition, Vector3.Up);
            }
        }
    }
}
