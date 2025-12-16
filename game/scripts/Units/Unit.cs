using Godot;
using WarYes.Data;
using WarYes.UI;
using System.Collections.Generic;
using System.Linq;

public partial class Unit : CharacterBody3D
{
    public enum MoveMode { Normal, Reverse, Fast, Hunt }
    // Remove direct property setter, derived from CurrentCommand
    public MoveMode CurrentMoveMode { 
        get { return _currentCommand != null ? _currentCommand.MoveMode : MoveMode.Normal; } 
    }
    
    // Tactical View
    private Sprite3D _tacticalIcon;
    private const float TACTICAL_VIEW_HEIGHT_THRESHOLD = 30.0f;
    private bool _inTacticalView = false;

    public class Command
    {
        public enum Type { Move, AttackUnit }
        public Type CommandType;
        public Vector3 TargetPosition;
        public Unit TargetUnit;
        public MoveMode MoveMode;
        public Vector3? FinalFacing;
    }

    private Queue<Command> _commandQueue = new Queue<Command>();
    private Command _currentCommand;

    public UnitData Data;
    public bool IsMoving = false;
    
    private NavigationAgent3D _navAgent;
    private MeshInstance3D _visuals;
    private CollisionShape3D _collisionShape;
    private MeshInstance3D _selectionData;
    private Node3D _visualRoot; // Visual pivot for altitude

    // Path Visualization
    private MeshInstance3D _pathMeshInstance;
    private ImmediateMesh _pathMesh;
    private Material _pathMaterial; // We will clone this for colors
    private ShaderMaterial _pathShaderMat;
    private MeshInstance3D _pathArrow;


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



    private void SetTacticalView(bool active)
    {
        _inTacticalView = active;
        
        if (_tacticalIcon == null) CreateTacticalIcon();
        if (_tacticalIcon != null) _tacticalIcon.Visible = active;
        
        if (_visuals != null) _visuals.Visible = !active;
        if (_unitUI != null) _unitUI.Visible = !active;
        
        // We might want to keep selection ring visible?
        // _selectionData is separate.
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
    
    // Unit UI
    private UnitUI _unitUI;
    private bool _isSelected = false;


    public void Initialize(UnitData data, int rank = 0)
    {
        Data = data;
        // Do NOT overwrite Name here, as UnitManager assigns a unique name (e.g. "enemy_tank_1")
        // Name = data.Id; 
        
        Health = Data.Health > 0 ? Data.Health : 10.0f; // Default if 0
        _maxHealth = Health; // Store for health bar calculation
        

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
        CreatePathVisuals();

        
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
    
    private void CreateUnitUI()
    {
        if (_unitUI != null) return;
        
        _unitUI = new UnitUI();
        _unitUI.Name = "UnitUI";
        _unitUI.TopLevel = true; // Decouple rotation from unit
        _visualRoot.AddChild(_unitUI);
        
        // Determine Category
        string category = "infantry";
        if (Data.Id.Contains("tank") || Data.Id.Contains("mbt") || Data.Id.Contains("walker") || (Data.Fuel.HasValue)) category = "vehicle";
        if (Data.Id.Contains("air") || Data.Id.Contains("gunship")) category = "air";
        if (IsCommander) category = "commander";
        
        _unitUI.Initialize(Data.Id, Name, (int)_maxHealth, category, IsCommander);
        _unitUI.UpdateHealth((int)Health);
        
        // Ensure visibility is correct on init
        if (_inTacticalView) _unitUI.Visible = false;

    }



    
    private void UpdateVeterancyStatus()
    {
        // 1. Update Commander Buff
        bool buffed = false;
        if (!IsCommander && UnitManager.Instance != null) 
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
        
        if (_unitUI != null)
        {
            _unitUI.SetBuffStatus(buffed);
            _unitUI.SetVeterancy(Rank);
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
        
        // Create Unit UI
        CreateUnitUI();
        
        // Ammo Icon
        CreateAmmoIcon();
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

    private void CreateTacticalIcon()
    {
        if (_tacticalIcon != null) return;
        
        _tacticalIcon = new Sprite3D();
        _tacticalIcon.Name = "TacticalIcon";
        _tacticalIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
        _tacticalIcon.PixelSize = 0.03f; // Small size appropriate for tactical view
        _tacticalIcon.NoDepthTest = true; // Always visible on top
        _tacticalIcon.Modulate = Team == "Player" ? new Color(0.2f, 0.5f, 1.0f) : new Color(1.0f, 0.2f, 0.2f); // Team Color
        
        string iconName = GetCategoryIconName();
        string path = $"res://assets/icons/categories/{iconName}.svg";
        
        var tex = GD.Load<Texture2D>(path);
        if (tex != null)
        {
            _tacticalIcon.Texture = tex;
        }
        else
        {
            GD.PrintErr($"Failed to load tactical icon: {path}");
        }
        
        _tacticalIcon.Visible = false;
        AddChild(_tacticalIcon);
        // Position it slightly up so it's not clipping terrain
        _tacticalIcon.Position = new Vector3(0, 2.0f, 0);
    }

    private string GetCategoryIconName()
    {
        string id = Data.Id.ToLower();
        
        if (id.Contains("vtol") || id.Contains("gunship") || id.Contains("air") || id.Contains("heli") || id.Contains("jet")) return "vtol";
        if (id.Contains("artillery") || id.Contains("mortar") || id.Contains("howitzer") || id.Contains("mlrs")) return "artillery";
        if (id.Contains("aa") || id.Contains("anti-air") || id.Contains("flak") || id.Contains("sam")) return "anti_air";
        if (id.Contains("recon") || id.Contains("scout")) return "recon";
        if (id.Contains("tank") || id.Contains("mbt")) return "tank";
        if (id.Contains("apc") || id.Contains("ifv") || id.Contains("transport") || id.Contains("carrier")) return "apc";
        if (id.Contains("supply") || id.Contains("logistics") || id.Contains("support") || id.Contains("truck") || id.Contains("repair")) return "support";
        if (id.Contains("infantry") || id.Contains("soldier") || id.Contains("trooper") || id.Contains("squad") || id.Contains("rifle") || id.Contains("engineer") || id.Contains("grenadier")) return "infantry";
        
        // Fallbacks
        if (Data.Fuel.HasValue || id.Contains("vehicle")) return "tank"; // Generic vehicle
        
        return "infantry"; // Default
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
        
        if (_unitUI != null)
        {
            _unitUI.UpdateHealth((int)Health);
            _unitUI.UpdateMorale(Morale, MaxMorale);
        }
        
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
                if (_unitUI != null) _unitUI.SetRouting(true);
            }
        }
        if (_unitUI != null) _unitUI.UpdateMorale(Morale, MaxMorale);
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
            if (_unitUI != null) _unitUI.SetRouting(false);
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
            
            // Hunt Mode Logic - Pause/Resume based on engagement
            if (_currentCommand != null && _currentCommand.CommandType == Command.Type.Move && _currentCommand.MoveMode == MoveMode.Hunt)
            {
                 bool isEngaging = false;
                 foreach(var w in _weapons) if(w.CurrentTarget != null) isEngaging = true;
                 
                 if (isEngaging)
                 {
                     if (IsMoving)
                     {
                         IsMoving = false;
                         _navAgent.Velocity = Vector3.Zero;
                         GD.Print($"{Name} (Hunt) spotted enemy! Stopping to engage.");
                     }
                 }
                 else
                 {
                     if (!IsMoving && !_navAgent.IsNavigationFinished())
                     {
                         IsMoving = true;
                         _navAgent.TargetPosition = _currentCommand.TargetPosition; // Re-assign to resume
                         GD.Print($"{Name} (Hunt) area clear. Resuming move.");
                     }
                 }
            }
        }
        
        // Update Aim Indicators (High Frequency)
        UpdateAimIndicator();
        
        // Update Path Visuals
        UpdatePathVisuals();
        
        // Check Guidance Lock
        bool isGuiding = false;
        foreach(var w in _weapons) if(w.IsGuiding) isGuiding = true;
        
        if (isGuiding)
        {
             Velocity = Vector3.Zero;
             _navAgent.Velocity = Vector3.Zero;
             // Don't process movement
             return; 
        }

        // Movement Logic
        
        // Command Processing Check
        if (_currentCommand != null)
        {
            // Check for completion
            bool done = false;
            if (_currentCommand.CommandType == Command.Type.Move)
            {
                 if (_navAgent.IsNavigationFinished() && !IsMoving) done = true;
                 // If Hunt mode, we also want to wait until not engaging? 
                 // RTS convention: Move/Hunt moves to point. If blocked by enemies, it fights, then continues. 
                 // Once point reached, queue proceeds.
            }
            else if (_currentCommand.CommandType == Command.Type.AttackUnit)
            {
                if (!IsInstanceValid(_currentCommand.TargetUnit)) // Target Dead
                {
                    done = true;
                    // Stop chasing
                    IsMoving = false;
                    _navAgent.Velocity = Vector3.Zero;
                }
                else
                {
                    // Update Chase path periodically or every frame?
                    // Every frame is smoother for chase
                    _navAgent.TargetPosition = _currentCommand.TargetUnit.GlobalPosition;
                    IsMoving = true;
                    
                    // But if in range of weapon?
                    float distSq = GlobalPosition.DistanceSquaredTo(_currentCommand.TargetUnit.GlobalPosition);
                    float maxRange = GetMaxRange();
                    if (distSq < (maxRange * maxRange * 0.8f)) // Move within 80% of range
                    {
                         IsMoving = false; // Stop to shoot
                         _navAgent.Velocity = Vector3.Zero;
                    }
                    else
                    {
                         IsMoving = true;
                    }
                }
            }
            
            if (done)
            {
                _currentCommand = null;
                ProcessNextCommand();
                return;
            }
        }
        else
        {
             // No command, try process queue (e.g. idle after spawn)
             if (_commandQueue.Count > 0) ProcessNextCommand();
        }

        if (!IsMoving) return;
        if (_navAgent.IsNavigationFinished())
        {
            IsMoving = false;
            Velocity = Vector3.Zero;
            
            // Final Facing Logic
            if (_currentCommand != null && _currentCommand.FinalFacing.HasValue)
            {
                // Rotate towards final facing
                Vector3 currentForward = -GlobalTransform.Basis.Z;
                Vector3 targetForward = _currentCommand.FinalFacing.Value;
                
                // Rotation Speed (Reuse from ApplyRotationLogic logic or default)
                float rotSpeedDeg = Data.Speed.RotationSpeed.HasValue ? Data.Speed.RotationSpeed.Value : 90.0f;
                float rotSpeedRad = Mathf.DegToRad(rotSpeedDeg);
                float maxRotStep = rotSpeedRad * (float)delta;
                
                float angle = currentForward.AngleTo(targetForward);
                if (angle > 0.01f)
                {
                     Vector3 cross = currentForward.Cross(targetForward);
                     float sign = (cross.Y > 0) ? 1.0f : -1.0f;
                     float rotAmount = Mathf.Min(angle, maxRotStep);
                     RotateY(rotAmount * sign);
                     
                     // If we are close enough, we are "done" done.
                     if (angle < Mathf.DegToRad(5.0f))
                     {
                          // Fully aligned
                     }
                }
            }
            return;
        }

        Vector3 currentAgentPosition = GlobalTransform.Origin;
        Vector3 nextPathPosition = _navAgent.GetNextPathPosition();
        
        Vector3 newVelocity = (nextPathPosition - currentAgentPosition).Normalized();
        newVelocity *= _navAgent.MaxSpeed;
        
        // Reverse Logic Adjustment?
        // NavigationAgent always computes velocity towards next point.
        // If reversing, we still move TOWARDS the point, just facing backwards.
        // So Velocity is correct. Rotation in OnVelocityComputed is what changes.
        
        _navAgent.Velocity = newVelocity;
    }
    
    public float GetMaxRange()
    {
        float max = 0;
        foreach(var w in _weapons) if(w.Range > max) max = w.Range;
        return max > 0 ? max : 10.0f;
    }

    private void ProcessNextCommand()
    {
        if (_commandQueue.Count == 0) 
        {
            _currentCommand = null;
            return;
        }
        
        _currentCommand = _commandQueue.Dequeue();
        ExecuteCommand(_currentCommand);
    }
    
    private void ExecuteCommand(Command cmd)
    {
        if (cmd.CommandType == Command.Type.Move)
        {
            BreakAllGuidance(); // Stop guiding to move immediately
            _navAgent.TargetPosition = cmd.TargetPosition;
            IsMoving = true;
            GD.Print($"{Name} executing Move to {cmd.TargetPosition} ({cmd.MoveMode}).");
        }
        else if (cmd.CommandType == Command.Type.AttackUnit)
        {
             if (IsInstanceValid(cmd.TargetUnit))
             {
                 _navAgent.TargetPosition = cmd.TargetUnit.GlobalPosition;
                 IsMoving = true;
                 GD.Print($"{Name} executing Attack/Chase on {cmd.TargetUnit.Name}.");
                 
                 // Force weapons to target this unit? 
                 // Usually ScanAndFire picks best target. 
                 // We should probably override or prioritize.
                 // For now, let's rely on Proximity (ScanAndFire picks closest/best). 
                 // Since we move close, it should pick it up.
             }
             else
             {
                 ProcessNextCommand(); // Skip if invalid
             }
        }
    }
    
    private void BreakAllGuidance()
    {
        foreach(var w in _weapons)
        {
            if (w.IsGuiding) w.BreakGuidance();
        }
    }

    private void CreatePathVisuals()
    {
        if (_pathMeshInstance != null) return;

        // 1. Line
        _pathMesh = new ImmediateMesh();
        _pathMeshInstance = new MeshInstance3D();
        _pathMeshInstance.Mesh = _pathMesh;
        _pathMeshInstance.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
        _pathMeshInstance.TopLevel = true; // Draw in world space
        _pathMeshInstance.Name = "PathVisualizer";
        AddChild(_pathMeshInstance);

        // Load Shader
        var shader = GD.Load<Shader>("res://art/shaders/PathLine.gdshader");
        _pathShaderMat = new ShaderMaterial();
        _pathShaderMat.Shader = shader;
        _pathShaderMat.SetShaderParameter("color", new Color(0, 1, 0, 0.5f));
        _pathMeshInstance.MaterialOverride = _pathShaderMat;

        // 2. Arrow (Marker)
        _pathArrow = new MeshInstance3D();
        _pathArrow.Name = "PathArrow";
        var cone = new CylinderMesh();
        cone.TopRadius = 0.0f;
        cone.BottomRadius = 0.5f;
        cone.Height = 1.5f;
        _pathArrow.Mesh = cone;
        
        var arrowMat = new StandardMaterial3D();
        arrowMat.AlbedoColor = new Color(0, 1, 0, 0.8f);
        arrowMat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        arrowMat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _pathArrow.MaterialOverride = arrowMat;
        
        _pathArrow.TopLevel = true;
        _pathArrow.Visible = false;
        AddChild(_pathArrow);
    }

    private void UpdatePathVisuals()
    {
        // Should we draw?
        bool hasActivePath = IsMoving || !_navAgent.IsNavigationFinished();
        bool hasQueue = _commandQueue.Count > 0;
        
        if (!hasActivePath && !hasQueue && (_currentCommand == null || _currentCommand.CommandType != Command.Type.Move))
        {
             if(_pathMesh != null) _pathMesh.ClearSurfaces();
             if(_pathArrow != null) _pathArrow.Visible = false;
             return;
        }

        _pathMesh.ClearSurfaces();
        _pathMesh.SurfaceBegin(Mesh.PrimitiveType.TriangleStrip);
        
        
        bool surfaceHasVertices = false;

        // 1. Current Path
        Vector3 lastPos = GlobalPosition;
        if (hasActivePath)
        {
            var pathPoints = _navAgent.GetCurrentNavigationPath();
            int startIndex = _navAgent.GetCurrentNavigationPathIndex();
            
            if (pathPoints != null && pathPoints.Length > 0)
            {
                // Add current pos as start
                AddRibbonPoint(lastPos + Vector3.Up * 0.5f, (pathPoints.Length > startIndex ? pathPoints[startIndex] : lastPos) + Vector3.Up * 0.5f, 0.4f, GetColorForMode(CurrentMoveMode));
                surfaceHasVertices = true;

                for (int i = startIndex; i < pathPoints.Length; i++)
                {
                    Vector3 p = pathPoints[i];
                    Vector3 nextP = (i + 1 < pathPoints.Length) ? pathPoints[i+1] : p;
                    AddRibbonPoint(p + Vector3.Up * 0.5f, nextP + Vector3.Up * 0.5f, 0.4f, GetColorForMode(CurrentMoveMode));
                    lastPos = p;
                }
            }
        }
        
        // 2. Queued Paths
        if (hasQueue)
        {
             var emptyMap = new Godot.Collections.Dictionary(); // For fast queries?
             var map = GetWorld3D().NavigationMap;
             
             foreach(var cmd in _commandQueue)
             {
                 Vector3 targetPos = Vector3.Zero;
                 if (cmd.CommandType == Command.Type.Move) targetPos = cmd.TargetPosition;
                 else if (cmd.CommandType == Command.Type.AttackUnit && IsInstanceValid(cmd.TargetUnit)) targetPos = cmd.TargetUnit.GlobalPosition;
                 else continue;
                 
                 // Query Path from lastPos to targetPos
                 var points = NavigationServer3D.MapGetPath(map, lastPos, targetPos, true);
                 
                 if (points != null && points.Length > 0)
                 {
                     Color cmdColor = GetColorForMode(cmd.MoveMode);
                     // Fix opacity
                     cmdColor.A = 0.5f; 

                     for (int i = 0; i < points.Length; i++)
                     {
                         Vector3 p = points[i];
                         Vector3 nextP = (i + 1 < points.Length) ? points[i+1] : p;
                         AddRibbonPoint(p + Vector3.Up * 0.5f, nextP + Vector3.Up * 0.5f, 0.4f, cmdColor);
                     }
                     surfaceHasVertices = true;

                     if (points.Length > 0) lastPos = points[points.Length - 1];
                 }
                 else
                 {
                     // Straight line fallback if nav fails?
                     AddRibbonPoint(lastPos + Vector3.Up * 0.5f, targetPos + Vector3.Up * 0.5f, 0.4f, GetColorForMode(cmd.MoveMode));
                     surfaceHasVertices = true;
                     lastPos = targetPos;
                 }
             }
        }
        
        if (surfaceHasVertices)
        {
            _pathMesh.SurfaceEnd();
        }
        else
        {
            _pathMesh.ClearSurfaces();
        }
        
        // Arrow at the very end
        if (_pathArrow != null)
        {
             _pathArrow.GlobalPosition = lastPos + Vector3.Up * 2.0f;
             _pathArrow.Visible = true;
             
             // Color arrow based on LAST command
             Color lastColor = new Color(0,1,0);
             if (_commandQueue.Count > 0) lastColor = GetColorForMode(_commandQueue.Last().MoveMode);
             else lastColor = GetColorForMode(CurrentMoveMode);
             
             if (_pathArrow.MaterialOverride is StandardMaterial3D arrowMat)
             {
                 arrowMat.AlbedoColor = new Color(lastColor.R, lastColor.G, lastColor.B, 0.8f);
             }
        }
    }
    
    // Ribbon Generation: Triangle Strip
    // We need 2 vertices per point.
    // To make it face up/camera properly usually requires camera facing logic, 
    // but for RTS path on ground, flat ribbon (XZ plane width) is usually good.
    private void AddRibbonPoint(Vector3 curr, Vector3 next, float width, Color color)
    {
        Vector3 dir = (next - curr).Normalized();
        if (dir.LengthSquared() < 0.001f) dir = Vector3.Forward; // Default
        
        Vector3 right = dir.Cross(Vector3.Up).Normalized() * (width * 0.5f);
        
        _pathMesh.SurfaceSetColor(color);
        _pathMesh.SurfaceSetUV(new Vector2(0, 0)); 
        _pathMesh.SurfaceAddVertex(curr - right);
        
        _pathMesh.SurfaceSetColor(color);
        _pathMesh.SurfaceSetUV(new Vector2(1, 0));
        _pathMesh.SurfaceAddVertex(curr + right);
    }
    
    private Color GetColorForMode(MoveMode mode)
    {
         switch (mode)
         {
            case MoveMode.Reverse: return new Color(0.6f, 0, 0.8f, 0.5f);
            case MoveMode.Fast: return new Color(1.0f, 0.5f, 0, 0.5f);
            case MoveMode.Hunt: return new Color(1.0f, 0, 0, 0.5f);
            default: return new Color(0, 1, 0, 0.5f);
         }
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
        _aimIndicatorRoot.GlobalPosition = GlobalPosition + new Vector3(0, 5.5f, 0);
        
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
        
        if (_unitUI != null) _unitUI.SetSelected(selected);
        
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
    
    public void MoveTo(Vector3 position, MoveMode mode = MoveMode.Normal, bool queue = false, Vector3? finalFacing = null)
    {
        if (IsRouting)
        {
            GD.Print($"{Name} is routing and ignores move command!");
            return;
        }
        
        var cmd = new Command {
            CommandType = Command.Type.Move,
            TargetPosition = position,
            MoveMode = mode,
            FinalFacing = finalFacing
        };
        
        if (queue)
        {
             _commandQueue.Enqueue(cmd);
             GD.Print($"{Name} queued Move to {position} ({mode})");
             
             // If idle, start immediately
             if (!IsMoving && _currentCommand == null) ProcessNextCommand();
        }
        else
        {
             _commandQueue.Clear();
             _currentCommand = cmd; // Set immediately
             ExecuteCommand(cmd);
        }
    }

    public void Attack(Unit target, bool queue = false)
    {
         if (IsRouting) return;
         if (target == null) return;
         
         var cmd = new Command {
             CommandType = Command.Type.AttackUnit,
             TargetUnit = target,
             MoveMode = MoveMode.Normal 
         };
         
        if (queue)
        {
             _commandQueue.Enqueue(cmd);
             GD.Print($"{Name} queued Attack on {target.Name}");
             if (!IsMoving && _currentCommand == null) ProcessNextCommand();
        }
        else
        {
             _commandQueue.Clear();
             _currentCommand = cmd;
             ExecuteCommand(cmd);
        }
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

        ApplyRotationLogic(safeVelocity, isVehicle, isAir);


        MoveAndSlide();
    }

    public override void _Process(double delta)
    {
        // Tactical View Toggle
        var viewport = GetViewport();
        if (viewport != null && viewport.GetCamera3D() != null)
        {
            float cameraHeight = viewport.GetCamera3D().GlobalPosition.Y;
            bool shouldBeTactical = cameraHeight > TACTICAL_VIEW_HEIGHT_THRESHOLD;
            
            if (shouldBeTactical != _inTacticalView)
            {
                SetTacticalView(shouldBeTactical);
            }
        }
        // Low freq update for visuals?
        // Let's do every frame for smooth popping for now, or use timer
        UpdateVeterancyStatus();

        // Update TopLevel Positions manually
        // Update TopLevel Positions manually
        if (_unitUI != null)
        {
            _unitUI.GlobalPosition = GlobalPosition; // UnitUI handles its own offset in Initialize/Structure
            // _unitUI is TopLevel, so it won't rotate with Unit.
            // But we want it to stay above the Unit.
            _unitUI.GlobalRotation = Quaternion.Identity.GetEuler(); // Ensure upright
            
            // Note: UnitUI.cs sets up offsets (BgSprite Position = 3.0f), so GlobalPosition matches Unit base.
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
        // 1. Identify Threats
        // Priority 1: Nearest Visible Enemy (Immediate danger)
        // Priority 2: Last Damage Source (If no enemies visible, e.g. long range fire)
        
        Vector3 threatDir = Vector3.Zero;
        Unit nearestEnemy = GetNearestEnemy(50.0f); // Look for enemies within 50m
        
        if (nearestEnemy != null)
        {
             threatDir = (GlobalPosition - nearestEnemy.GlobalPosition).Normalized();
        }
        else
        {
             // Fallback to damage source
             if (_lastDamageSourcePos != Vector3.Zero)
             {
                 threatDir = (GlobalPosition - _lastDamageSourcePos).Normalized();
             }
        }
        
        if (threatDir.LengthSquared() < 0.01f) 
        {
            // Fallback if no data: Run forward (or backwards?)
             threatDir = -Transform.Basis.Z; 
        }

        // Check current status
        int currentVisibleThreats = GetVisibleThreatCount(GlobalPosition);
        bool isCurrentlySafe = currentVisibleThreats == 0;

        // Sampling
        Vector3 bestCandidate = Vector3.Zero;
        bool foundSafeCandidate = false;
        
        // Setup Search
        int samples = 12; // More samples for better coverage
        float searchRadius = 25.0f;
        
        for (int i = 0; i < samples; i++)
        {
             // Fan out away from threat (Semi-circle mostly)
             // Base angle is Away from threat
             float baseAngle = Mathf.Atan2(threatDir.X, threatDir.Z);
             
             // Spread: +/- 90 degrees? Or 360 if we are confused?
             // Usually routing = running AWAY. So +/- 90 is good.
             // Let's do +/- 100 degrees to allows slightly side-stepping obstacles.
             float offset = (GD.Randf() - 0.5f) * Mathf.DegToRad(200.0f); 
             float angle = baseAngle + offset;
             
             Vector3 dir = new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle));
             float dist = 15.0f + GD.Randf() * 15.0f; // 15 to 30m
             Vector3 candidate = GlobalPosition + dir * dist;
             
             // Check Visibility at Candidate
             int candidateThreats = GetVisibleThreatCount(candidate);
             
             if (candidateThreats == 0)
             {
                 // Candidate is Safe!
                 // If we are already safe, only move if this is "better" (further from threat source)
                 if (isCurrentlySafe)
                 {
                     float currentDist = GlobalPosition.DistanceSquaredTo(_lastDamageSourcePos);
                     float newDist = candidate.DistanceSquaredTo(_lastDamageSourcePos);
                     if (newDist > currentDist + 25.0f) // Must be meaningfully further (5m^2 = 25)
                     {
                         _navAgent.TargetPosition = candidate;
                         return; // Move to better safe spot
                     }
                 }
                 else
                 {
                     // We were unsafe, now we found a safe spot. Go there immediately.
                     _navAgent.TargetPosition = candidate;
                     return;
                 }
                 foundSafeCandidate = true;
             }
        }
        
        // If we found NO safe candidates:
        if (isCurrentlySafe)
        {
            // We are safe here, but couldn't find a better spot.
            // STAY HERE. Do NOT run out.
            _navAgent.TargetPosition = GlobalPosition;
            _navAgent.Velocity = Vector3.Zero;
            return;
        }
        
        // If we are UNSAFE and found NO safe spots, we must Panic Run (Fallback)
        // Try to minimize threats? Or just run?
        // Let's run blindly away.
        Vector3 fleePos = GlobalPosition + threatDir * 30.0f;
        _navAgent.TargetPosition = fleePos;
    }

    private int GetVisibleThreatCount(Vector3 pos)
    {
        if (UnitManager.Instance == null) return 0;
        int count = 0;
        
        var spaceState = GetWorld3D().DirectSpaceState;
        
        foreach (var enemy in UnitManager.Instance.GetActiveUnits())
        {
            if (enemy == null || enemy.Team == this.Team) continue;
            
            // Optimization: Only check enemies within range (e.g. 100m)
            // Distant enemies might see us, but for routing logic we care about immediate danger.
            if (pos.DistanceSquaredTo(enemy.GlobalPosition) > 10000.0f) continue; // 100m
            
            // Raycast check
            // We check FROM Enemy TO Us (Position).
            // This assumes Enemy can see us if we are at 'pos'.
            // Note: 'pos' might be inside a wall? We assume NavMesh keeps 'pos' valid.
            // We lift points up for LOS.
            
            var from = enemy.GlobalPosition + Vector3.Up * 1.5f;
            var to = pos + Vector3.Up * 1.5f;
            
            var query = PhysicsRayQueryParameters3D.Create(from, to);
             // We can ignore self, but 'pos' doesn't have a body yet.
             // We want to know if 'pos' is obscured by world geometry.
             // We usually ignore 'enemy' and 'this'.
             
            // Exclude enemy body from blocking its own view
            var excludeList = new Godot.Collections.Array<Godot.Rid>();
            excludeList.Add(enemy.GetRid());
            excludeList.Add(GetRid());
            
            query.Exclude = excludeList;
            
            var result = spaceState.IntersectRay(query);
            
            if (result.Count == 0)
            {
                // Nothing blocking -> Visible
                count++;
            }
        }
        return count;
    }
    
    private bool CheckLineOfSightPoints(Vector3 from, Vector3 to)
    {
         // Legacy helper, kept if needed or replaced.
         // Used by old logic but we are replacing FindSafePosition.
         // We can keep it or let it be removed if unused.
         // Check usages: ScanAndFire uses CheckLineOfSight(Unit).
         // This overload (Vector3, Vector3) was private for FindSafePosition.
         // We can redefine it or just rely on GetVisibleThreatCount.
         return false; 
    }
    private void ApplyRotationLogic(Vector3 safeVelocity, bool isVehicle, bool isAir)
    {
        if (CurrentMoveMode == MoveMode.Reverse && isVehicle && !isAir)
        {
             // Reverse Logic: Look AWAY from velocity
            Vector3 moveDir = safeVelocity.Normalized();
            if (moveDir.LengthSquared() < 0.01f) return;

             // We want "Back" (-Z) to point in moveDir.
             // Body Forward = -moveDir.
             // LookAt target = GlobalPos + BodyForward = GlobalPos - moveDir.
             
             Vector3 lookTarget = GlobalPosition - moveDir;
             
             // Smooth turn logic identical to Forward but with inverted target
            Vector3 direction = (lookTarget - GlobalPosition).Normalized();
            Vector3 currentForward = -GlobalTransform.Basis.Z;
            float angle = currentForward.AngleTo(direction);

            float rotSpeedDeg = Data.Speed.RotationSpeed.HasValue ? Data.Speed.RotationSpeed.Value : 90.0f;
            float maxRotStep = Mathf.DegToRad(rotSpeedDeg) * (float)GetPhysicsProcessDeltaTime();

            if (angle > 0.01f)
            {
                Vector3 cross = currentForward.Cross(direction);
                float sign = (cross.Y > 0) ? 1.0f : -1.0f;
                float rotAmount = Mathf.Min(angle, maxRotStep);
                RotateY(rotAmount * sign);
                
                if (Mathf.Abs(angle) > Mathf.DegToRad(45.0f)) // Wider tolerance for reverse?
                {
                     Velocity = Vector3.Zero;
                }
                else
                {
                     Velocity = safeVelocity;
                }
            }
            else
            {
                 Velocity = safeVelocity;
            }
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
    }

    private Unit GetNearestEnemy(float maxRange)
    {
         if (UnitManager.Instance == null) return null;
         Unit nearest = null;
         float minDistSq = maxRange * maxRange;
         
         foreach(var u in UnitManager.Instance.GetActiveUnits())
         {
             if (u == this || u.Team == this.Team || u.IsQueuedForDeletion()) continue;
             
             float d = GlobalPosition.DistanceSquaredTo(u.GlobalPosition);
             if (d < minDistSq)
             {
                 minDistSq = d;
                 nearest = u;
             }
         }
         return nearest;
    }
}

