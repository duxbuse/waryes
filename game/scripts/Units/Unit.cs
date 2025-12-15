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
    public float Health { get; private set; }
    private float _maxHealth;
    
    // Morale
    public float Morale { get; private set; }
    public float MaxMorale { get; private set; } = 100.0f;
    public bool IsRouting { get; private set; } = false;
    private Vector3 _lastDamageSourcePos;
    private Unit _lastAttacker;
    
    public string Team { get; set; } = "Player"; // "Player" or "Enemy"
    private List<Weapon> _weapons = new List<Weapon>();
    private float _scanTimer = SCAN_INTERVAL; // Start ready to scan
    private const float SCAN_INTERVAL = 0.5f;
    private float _routingCooldownTimer = 0.0f; // 20s pause after routing starts
    
    // Veterancy
    public int Rank { get; private set; } = 0;
    public int CurrentExperience { get; private set; } = 0;
    
    // Health & Morale Bars
    private Sprite3D _healthBarBg;
    private Sprite3D _healthBarFg;
    private Sprite3D _moraleBarBg;
    private Sprite3D _moraleBarFg;
    private Node3D _healthBarRoot;
    private bool _isSelected = false;

    public void Initialize(UnitData data, int rank = 0)
    {
        Data = data;
        // Do NOT overwrite Name here, as UnitManager assigns a unique name (e.g. "enemy_tank_1")
        // Name = data.Id; 
        
        Health = Data.Health > 0 ? Data.Health : 10.0f; // Default if 0
        _maxHealth = Health; // Store for health bar calculation
        
        // Morale Override
        if (Data.Id.ToLower().Contains("stormtrooper"))
        {
             MaxMorale = 30.0f;
        }
        else
        {
             MaxMorale = 100.0f;
        }
        Morale = MaxMorale; // Initialize full morale
        
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
                w.Initialize(this, wData.WeaponId, wData.MaxAmmo);
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
        
        // Initial Rank
        Rank = rank;
        
        // Setup Visuals
        CreateCommanderBuffIcon();
        CreateRankIcon();
        UpdateVeterancyStatus(); // Initial State
        
        GD.Print($"Unit {Name} initialized: Team={Team}, Weapons={_weapons.Count}, Health={Health}, Commander={IsCommander}, Rank={Rank}");
    }

    public bool IsCommander { get; private set; }
    private Node3D _commanderAura;
    private Sprite3D _commanderBuffIcon; // Was _veterancyIcon
    private Node3D _rankIconRoot; // Container for Rank Chevrons

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
    
    private void CreateCommanderBuffIcon()
    {
         if (_commanderBuffIcon != null) return;
         
        // Simple Billboard Sprite above unit to indicate "I am buffed by a commander"
        _commanderBuffIcon = new Sprite3D();
        _commanderBuffIcon.Name = "CmdBuffIcon";
        
        // Use a simple Plus sign or Star for buff
        var image = Image.Create(32, 32, false, Image.Format.Rgba8);
        for(int x=0; x<32; x++)
            for(int y=0; y<32; y++)
            {
                 // Plus Shape
                 if ((x > 12 && x < 20) || (y > 12 && y < 20))
                     image.SetPixel(x, y, new Color(0, 1, 1)); // Cyan for Buff
            }
            
        var tex = ImageTexture.CreateFromImage(image);
        _commanderBuffIcon.Texture = tex;
        _commanderBuffIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _commanderBuffIcon.PixelSize = 0.02f;
        _commanderBuffIcon.Position = new Vector3(0, 4.5f, 0); // High above
        _commanderBuffIcon.Visible = false; 
        
        AddChild(_commanderBuffIcon);
    }

    private void CreateRankIcon()
    {
        if (_rankIconRoot != null) return;

        _rankIconRoot = new Node3D();
        _rankIconRoot.Name = "RankIcons";
        AddChild(_rankIconRoot);

        // We will rebuild chevrons on rank change, or just toggle visibility if we built all 3.
        // Let's build 3 chevrons and toggle them.
        for(int i=1; i<=3; i++)
        {
             var chev = new Sprite3D();
             chev.Name = $"Chevron_{i}";
             
             var image = Image.Create(32, 32, false, Image.Format.Rgba8);
             // Draw Chevron (V shape)
             for(int x=0; x<32; x++)
                for(int y=0; y<32; y++)
                {
                     int centerDist = Mathf.Abs(x - 16);
                     // V shape logic
                     if (y > centerDist && y < centerDist + 6) 
                         image.SetPixel(x, y, new Color(1, 0.84f, 0)); // Gold
                }
             
             var tex = ImageTexture.CreateFromImage(image);
             chev.Texture = tex;
             chev.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
             chev.PixelSize = 0.015f;
             
             // Stack them vertically
             // Rank 1 at bottom, Rank 3 on top? Or reverse?
             // Typically Rank 1 is one chevron. Rank 2 is two stacked.
             // Base pos 3.5m. Offset by i.
             float yOffset = 3.5f + (i * 0.3f); 
             chev.Position = new Vector3(0, yOffset, 0);
             chev.Visible = false;
             
             _rankIconRoot.AddChild(chev);
        }
    }
    
    private void UpdateVeterancyStatus()
    {
         // 1. Update Commander Buff
         bool buffed = false;
         if (!IsCommander && UnitManager.Instance != null) // Commanders don't get buffed by themselves or others (design choice? usually yes)
         {
             foreach(var u in UnitManager.Instance.GetActiveUnits())
             {
                 if (u == this) continue;
                 if (u.IsCommander && u.Team == this.Team)
                 {
                     if (GlobalPosition.DistanceSquaredTo(u.GlobalPosition) < 400.0f) // 20m sq
                     {
                         buffed = true;
                         break;
                     }
                 }
             }
         }
         
         if (_commanderBuffIcon != null) _commanderBuffIcon.Visible = buffed;
         
         // 2. Update Rank Icons
         if (_rankIconRoot != null)
         {
             for(int i=1; i<=3; i++)
             {
                 var node = _rankIconRoot.GetNodeOrNull<Sprite3D>($"Chevron_{i}");
                 if (node != null)
                 {
                     node.Visible = (Rank >= i);
                 }
             }
         }
    }
    
    public void GainExperience(int amount)
    {
        // Formula: XP_Needed = Cost * (2^Rank) = Cost * (1 << Rank)
        // int cost = Data.Cost; // Assuming Cost is in UnitData. If not:
        int cost = (Data.Cost > 0) ? Data.Cost : 50; // Fallback
        
        int xpNeeded = cost * (1 << Rank);
        
        // Cap Rule: Max 1 level up per source.
        // Available space to fill = xpNeeded - CurrentExperience.
        int neededToLevel = xpNeeded - CurrentExperience;
        
        int actualGain = Mathf.Min(amount, neededToLevel);
        
        CurrentExperience += actualGain;
        GD.Print($"{Name} gained {actualGain} XP (Requested: {amount}). XP: {CurrentExperience}/{xpNeeded}. Rank: {Rank}");
        
        if (CurrentExperience >= xpNeeded)
        {
            LevelUp();
        }
        else
        {
             // Wasted XP check?
             if (amount > actualGain)
             {
                 GD.Print($"XP Cap Reached! {amount - actualGain} XP wasted.");
             }
        }
    }
    
    private void LevelUp()
    {
        Rank++;
        CurrentExperience = 0; // Reset
        GD.Print($"{Name} LEVELED UP! Now Rank {Rank}!");
        
        // Update Visuals
        UpdateVeterancyStatus();
        
        // Visual Effect?
        // TODO: Particle effect or text
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
        
        // Ammo Icon
        CreateAmmoIcon();
    }
    
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
        _healthBarBg.PixelSize = 0.01f; 
        _healthBarBg.Scale = new Vector3(2.0f / 0.01f, 0.5f / 0.01f, 1);
        _healthBarBg.RenderPriority = 10;
        _healthBarBg.NoDepthTest = true; 
        _healthBarRoot.AddChild(_healthBarBg);
        
        // Foreground Sprite
        _healthBarFg = new Sprite3D();
        _healthBarFg.Name = "FG";
        _healthBarFg.Texture = texture;
        _healthBarFg.Modulate = new Color(0, 1, 0); // Green
        _healthBarFg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _healthBarFg.PixelSize = 0.01f;
        _healthBarFg.RenderPriority = 11; 
        _healthBarFg.NoDepthTest = true;
        _healthBarRoot.AddChild(_healthBarFg);
        
        // -- Morale Bar --
        _moraleBarBg = new Sprite3D();
        _moraleBarBg.Name = "MoraleBG";
        _moraleBarBg.Texture = texture;
        _moraleBarBg.Modulate = new Color(0, 0, 0); // Black
        _moraleBarBg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _moraleBarBg.PixelSize = 0.01f;
        _moraleBarBg.Scale = new Vector3(2.0f / 0.01f, 0.25f / 0.01f, 1);
        _moraleBarBg.Position = new Vector3(0, -0.4f, 0); 
        _moraleBarBg.RenderPriority = 10;
        _moraleBarBg.NoDepthTest = true;
        _healthBarRoot.AddChild(_moraleBarBg);

        _moraleBarFg = new Sprite3D();
        _moraleBarFg.Name = "MoraleFG";
        _moraleBarFg.Texture = texture;
        _moraleBarFg.Modulate = new Color(0, 1, 0); // Green
        _moraleBarFg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _moraleBarFg.PixelSize = 0.01f;
        _moraleBarFg.Position = new Vector3(0, -0.4f, 0);
        _moraleBarFg.RenderPriority = 11;
        _moraleBarFg.NoDepthTest = true;
        _healthBarRoot.AddChild(_moraleBarFg);
        
        _healthBarRoot.Visible = false;
    }
    
    // Renamed from UpdateHealthBar logic
    private void UpdateStatusBars()
    {
        if (_healthBarBg == null || _healthBarFg == null) return;
        
        float healthPercent = (float)Health / _maxHealth;
        bool moraleDamaged = Morale < MaxMorale;
        
        if (healthPercent >= 1.0f && !moraleDamaged && !_isSelected)
        {
            _healthBarRoot.Visible = false;
            return;
        }
        
        _healthBarRoot.Visible = true;
        
        // HP Color
        if (healthPercent > 0.5f) _healthBarFg.Modulate = new Color(0, 1, 0); 
        else if (healthPercent > 0.25f) _healthBarFg.Modulate = new Color(1, 1, 0); 
        else _healthBarFg.Modulate = new Color(1, 0, 0); 
        
        // HP Scale
        float targetWidth = 2.0f * healthPercent;
        _healthBarFg.Scale = new Vector3(targetWidth / 0.01f, 0.5f / 0.01f, 1);
        _healthBarFg.Position = new Vector3(-1.0f + (targetWidth / 2.0f), 0, 0);
        
        // Morale Logic
        if (_moraleBarFg != null)
        {
            float moralePercent = Mathf.Clamp(Morale / MaxMorale, 0, 1);
            
            if (moralePercent <= 0) _moraleBarFg.Modulate = new Color(0, 0, 0); 
            else if (moralePercent < 0.5f) _moraleBarFg.Modulate = new Color(1, 0.5f, 0); 
            else _moraleBarFg.Modulate = new Color(0, 1, 0); 
             
            float mTargetWidth = 2.0f * moralePercent;
            _moraleBarFg.Scale = new Vector3(mTargetWidth / 0.01f, 0.25f / 0.01f, 1);
            _moraleBarFg.Position = new Vector3(-1.0f + (mTargetWidth / 2.0f), -0.4f, 0); 
        }
    }
    
    private Sprite3D _ammoIcon;

    private void CreateAmmoIcon()
    {
         if (_ammoIcon != null) return;
         
        _ammoIcon = new Sprite3D();
        _ammoIcon.Name = "AmmoIcon";
        
        // Create Red "!" Box
        // Use CreateEmpty as suggested by warnings
        var image = Image.CreateEmpty(32, 32, false, Image.Format.Rgba8);
        for(int x=0; x<32; x++)
            for(int y=0; y<32; y++)
            {
                 // Red Border
                 if (x < 2 || x > 29 || y < 2 || y > 29)
                 {
                     image.SetPixel(x, y, new Color(1, 0, 0)); 
                 }
                 // Yellow Background
                 else
                 {
                     image.SetPixel(x, y, new Color(1, 1, 0, 0.5f));
                 }
                 
                 // Black Exclamation (Simple)
                 if (x >= 14 && x <= 17)
                 {
                     if (y > 6 && y < 20) image.SetPixel(x, y, new Color(0,0,0)); // Top part
                     if (y > 23 && y < 26) image.SetPixel(x, y, new Color(0,0,0)); // Dot
                 }
            }
            
        var tex = ImageTexture.CreateFromImage(image);
        _ammoIcon.Texture = tex;
        _ammoIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _ammoIcon.PixelSize = 0.02f;
        _ammoIcon.Position = new Vector3(0, 5.0f, 0); // High above, above Rank?
        _ammoIcon.Visible = false; // Hidden by default
        
        AddChild(_ammoIcon);
    }

    public void CheckAmmoStatus()
    {
        if (_ammoIcon == null) CreateAmmoIcon();
        
        bool anyEmpty = false;
        foreach (var w in _weapons)
        {
            if (w.MaxAmmo > 0 && w.CurrentAmmo <= 0)
            {
                anyEmpty = true;
                break;
            }
        }
        
        _ammoIcon.Visible = anyEmpty;
        if (anyEmpty)
        {
            // GD.Print($"{Name} has empty weapons relative to loadout.");
        }
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

    public void TriggerSuppressionImpact(float amount, Vector3 sourcePosition)
    {
        // Apply to self
        ApplySuppression(amount, sourcePosition);
        
        // Splash Suppression to nearby friendlies
        if (UnitManager.Instance != null)
        {
            foreach(var u in UnitManager.Instance.GetActiveUnits())
            {
                if (u == this || u.Team != this.Team) continue;
                if (GlobalPosition.DistanceSquaredTo(u.GlobalPosition) <= 100.0f) // 10m * 10m
                {
                    u.ApplySuppression(amount, sourcePosition);
                }
            }
        }
    }

    public void TakeDamage(float amount, Vector3 sourcePosition)
    {
        Health -= amount;
        
        float moraleDmg = amount * 1.5f;
        
        // Trigger Suppression Event (Self + Splash)
        TriggerSuppressionImpact(moraleDmg, sourcePosition);
        
        GD.Print($"{Name} took {amount} damage. HP: {Health}. Morale: {Morale}");
        
        UpdateStatusBars();
        
        if (Health <= 0)
        {
            Die();
        }
    }
    
    public void ApplySuppression(float amount, Vector3 sourcePosition)
    {
        Morale -= amount;
        _lastDamageSourcePos = sourcePosition;
        
        if (Morale <= 0)
        {
            Morale = 0;
            if (!IsRouting)
            {
                IsRouting = true;
                _routingCooldownTimer = 20.0f;
                GD.Print($"{Name} is routing! Running away. Recovery paused for 20s.");
                foreach(var w in _weapons) w.StopEngaging();
            }
        }
        UpdateStatusBars();
    }
    
    public void TakeDamage(float amount, Unit attacker)
    {
        if (IsInstanceValid(attacker)) _lastAttacker = attacker;
        TakeDamage(amount, attacker != null ? attacker.GlobalPosition : GlobalPosition);
    }

    public void TakeDamage(float amount) 
    {
        TakeDamage(amount, GlobalPosition + Vector3.Forward); 
    }
    
    private void Die()
    {
        GD.Print($"{Name} destroyed!");
        
        // Award XP
        if (_lastAttacker != null && IsInstanceValid(_lastAttacker) && _lastAttacker != this && _lastAttacker.Team != this.Team)
        {
             // XP = My Cost
             int reward = (Data.Cost > 0) ? Data.Cost : 50;
             _lastAttacker.GainExperience(reward);
        }
        if (_selectionData != null && _selectionData.Visible)
        {
            // SelectionManager handles cleanup via checking IsQueuedForDeletion usually
        }
        QueueFree();
    }

    public override void _PhysicsProcess(double delta)
    {
        // Recovery Logic
        if (_routingCooldownTimer > 0)
        {
            _routingCooldownTimer -= (float)delta;
        }
        else if (Morale < MaxMorale)
        {
            Morale += 0.5f * (float)delta;
            if (Morale > MaxMorale) Morale = MaxMorale;
        }
        
        // Rally Check
        if (IsRouting && Morale > 0)
        {
            IsRouting = false;
            GD.Print($"{Name} rallied! Stopping rout.");
            _navAgent.Velocity = Vector3.Zero;
            _navAgent.TargetPosition = GlobalPosition; // Stop moving
        }

        if (IsRouting)
        {
            ProcessRoutingBehavior((float)delta);
            UpdateAimIndicator();
            return; 
        }
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
       // 1. Gather potential targets (All enemies within max range of ANY weapon)
       // Optimization: UnitManager could provide a spatial query, but for now iterate active units.
       
       if (UnitManager.Instance == null) return;
       
       List<Unit> candidates = new List<Unit>();
       float maxUnitRange = 0;
       foreach(var w in _weapons) if(w.Range > maxUnitRange) maxUnitRange = w.Range;
       float maxRangeSq = maxUnitRange * maxUnitRange;
       
       foreach (var other in UnitManager.Instance.GetActiveUnits())
       {
            if (other == null || !IsInstanceValid(other) || other.IsQueuedForDeletion()) continue;
            if (other == this || other.Team == this.Team) continue;
            
            float distSq = GlobalPosition.DistanceSquaredTo(other.GlobalPosition);
            if (distSq <= maxRangeSq)
            {
                candidates.Add(other);
            }
       }
       
       // Sort candidates by distance (Closest first)
       // Optimized sort for frame performance? List.Sort is usually fine for small counts.
       candidates.Sort((a, b) => 
            GlobalPosition.DistanceSquaredTo(a.GlobalPosition)
            .CompareTo(GlobalPosition.DistanceSquaredTo(b.GlobalPosition)));
       
       // 2. Assign Targets per Weapon
       foreach (var w in _weapons)
       {
           Unit targetToEngage = null;
           
           // Check current target first (stickiness)
           if (w.CurrentTarget != null && IsInstanceValid(w.CurrentTarget) && !w.CurrentTarget.IsQueuedForDeletion())
           {
               // Still valid?
               float distSq = GlobalPosition.DistanceSquaredTo(w.CurrentTarget.GlobalPosition);
               if (distSq <= w.Range * w.Range && w.CanPenetrate(w.CurrentTarget) && CheckLineOfSight(w.CurrentTarget))
               {
                   targetToEngage = w.CurrentTarget;
               }
           }
           
           // If no current target or it became invalid/invulnerable, find new one
           if (targetToEngage == null)
           {
               foreach (var candidate in candidates)
               {
                   // Range Check
                   float distSq = GlobalPosition.DistanceSquaredTo(candidate.GlobalPosition);
                   if (distSq > w.Range * w.Range) continue; // List is sorted, but weapons have diff ranges
                   
                   // Penetration Check
                   if (!w.CanPenetrate(candidate)) continue;
                   
                   // LOS Check (Expensive, do last)
                   if (!CheckLineOfSight(candidate)) continue;
                   
                   targetToEngage = candidate;
                   break; // Found closest valid target
               }
           }
           
           if (targetToEngage != null)
           {
               w.Engage(targetToEngage);
           }
           else
           {
               w.StopEngaging();
           }
       }
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
    
    private Node3D _rangeVisualRoot;

    public void SetSelected(bool selected)
    {
        _isSelected = selected;
        if (_selectionData != null)
        {
            _selectionData.Visible = selected;
        }
        UpdateStatusBars();
        
        // Range Visuals
        if (selected)
        {
             CreateRangeVisuals();
             if (_rangeVisualRoot != null) _rangeVisualRoot.Visible = true;
        }
        else
        {
             if (_rangeVisualRoot != null) _rangeVisualRoot.Visible = false;
        }
    }
    
    private void CreateRangeVisuals()
    {
        if (_rangeVisualRoot != null) return;
        
        _rangeVisualRoot = new Node3D();
        _rangeVisualRoot.Name = "RangeVisuals";
        _rangeVisualRoot.TopLevel = true; // Decouple transform completely
        AddChild(_rangeVisualRoot); 
        
        // Group weapons by Range
        var grouped = new Dictionary<float, List<string>>();
        foreach(var w in _weapons)
        {
            if (!grouped.ContainsKey(w.Range)) grouped[w.Range] = new List<string>();
            grouped[w.Range].Add(w.WeaponId);
        }
        
        // Create visuals for each group
        foreach (var kvp in grouped)
        {
             float range = kvp.Key;
             List<string> names = kvp.Value;
             
             // Ring
             var meshInst = new MeshInstance3D();
             var torus = new TorusMesh();
             torus.InnerRadius = range - 0.1f;
             torus.OuterRadius = range; 
             meshInst.Mesh = torus;
             
             var mat = new StandardMaterial3D();
             // Same color as text: Faint White
             mat.AlbedoColor = new Color(1, 1, 1, 0.15f); 
             mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
             mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
             meshInst.MaterialOverride = mat;
             
             _rangeVisualRoot.AddChild(meshInst);
             
             // Label
             var label = new Label3D();
             // Combine names: "Cannon, MG"
             // Remove overlapping duplicates? e.g. "rifle, rifle" -> "rifle x2"?
             // For now simple join
             label.Text = $"{string.Join(", ", names)} ({range}m)";
             label.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
             label.PixelSize = 0.05f; 
             // Same Color as Radius (Requested)
             label.Modulate = new Color(1, 1, 1, 0.5f); // 0.15 is too faint for text, using 0.5 but same hue (White)
             // Position: North (Forward in Global Z terms is -Z)
             // Since Root is GlobalRotation Zero, -Z is always "North" on map.
             label.Position = new Vector3(0, 2.0f, -range); 
             label.OutlineRenderPriority = 10;
             
             _rangeVisualRoot.AddChild(label);
        }
    }
    
    public void MoveTo(Vector3 position)
    {
        if (IsRouting)
        {
            GD.Print($"{Name} is routing and ignores move command!");
            return;
        }
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
                 // Avoid LookAt error if moving straight up/down
                 if (GlobalPosition.DistanceSquaredTo(lookTarget) > 0.001f && Mathf.Abs(Velocity.Normalized().Dot(Vector3.Up)) < 0.99f)
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
        
        if (_rangeVisualRoot != null && _rangeVisualRoot.Visible)
        {
             // Keep position sync but reset rotation to Zero (North up)
             _rangeVisualRoot.GlobalPosition = GlobalPosition;
             _rangeVisualRoot.GlobalRotation = Vector3.Zero;
        }
    }

    private void ProcessRoutingBehavior(float delta)
    {
        if (_navAgent.IsNavigationFinished())
        {
             FindSafePosition();
        }
        
        Vector3 currentAgentPosition = GlobalTransform.Origin;
        Vector3 nextPathPosition = _navAgent.GetNextPathPosition();
        Vector3 newVelocity = (nextPathPosition - currentAgentPosition).Normalized();
        newVelocity *= (_navAgent.MaxSpeed * 1.5f); 
        _navAgent.Velocity = newVelocity;
        
        if (newVelocity.LengthSquared() > 0.1f)
        {
             var targetLook = GlobalPosition + newVelocity;
             LookAt(new Vector3(targetLook.X, GlobalPosition.Y, targetLook.Z), Vector3.Up);
        }
        
        MoveAndSlide();
    }
    
    private void FindSafePosition()
    {
        Vector3 threatDir = (GlobalPosition - _lastDamageSourcePos).Normalized();
        
        // 1. Search for static obstacles within LOS (Max 40m for safety)
        var spaceState = GetWorld3D().DirectSpaceState;
        var shape = new SphereShape3D();
        shape.Radius = 40.0f; 
        var query = new PhysicsShapeQueryParameters3D();
        query.Shape = shape;
        query.Transform = GlobalTransform;
        query.CollisionMask = 1; 
        
        var results = spaceState.IntersectShape(query, 10);
        
        // Simple heuristic: Try random points away from threat
        for (int i = 0; i < 8; i++)
        {
             float baseAngle = Mathf.Atan2(threatDir.X, threatDir.Z);
             float offset = (GD.Randf() - 0.5f) * Mathf.Pi; 
             float angle = baseAngle + offset;
             
             Vector3 dir = new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle));
             float dist = 20.0f + GD.Randf() * 10.0f;
             Vector3 candidate = GlobalPosition + dir * dist;
             
             if (!CheckLineOfSightPoints(candidate, _lastDamageSourcePos))
             {
                 _navAgent.TargetPosition = candidate;
                 return;
             }
        }
        
        Vector3 fleePos = GlobalPosition + threatDir * 30.0f;
        _navAgent.TargetPosition = fleePos;
    }
    
    private bool CheckLineOfSightPoints(Vector3 from, Vector3 to)
    {
         var spaceState = GetWorld3D().DirectSpaceState;
         var ray = PhysicsRayQueryParameters3D.Create(from + Vector3.Up, to + Vector3.Up);
         var res = spaceState.IntersectRay(ray);
         // If IntersectRay hits something, LOS is blocked.
         // We WANT it to be blocked for Safety (return false for "Has LOS").
         // If count == 0, we HAVE LOS.
         return res.Count == 0;
    }
}
