using Godot;
using System;

namespace WarYes.UI
{
    public partial class UnitUI : Node3D
    {
        // Configuration
        private const float SCALE_FACTOR = 0.006f; // Adjust to match pixel art look
        private const float BOX_WIDTH = 2.0f; // World units
        // private const float BOX_HEIGHT = 2.5f; // World Units

        // Nodes
        private Sprite3D _headerBg;
        private Sprite3D _bodyBg;
        private Label3D _nameLabel;
        private Node3D _veterancyRoot;
        private Sprite3D[] _vetChevrons;
        private Sprite3D _categoryIcon;
        private Sprite3D _commanderAuraIcon;
        private Sprite3D _moraleOverlay; 
        private Sprite3D _hpBar; // Segmented
        private ShaderMaterial _hpMaterial;
        
        // Data
        // Data
        private int _maxHealth;
        private bool _isSelected;
        private bool _isRouting = false;
        private float _blinkTimer = 0.0f;

        public override void _Ready()
        {
            // Initialization if added via scene
        }

        public override void _Process(double delta)
        {
            if (_isRouting && _moraleOverlay != null)
            {
                _blinkTimer -= (float)delta;
                if (_blinkTimer <= 0)
                {
                    _blinkTimer = 0.2f; // Fast blink
                    if (_moraleOverlay.Modulate.R > 0.9f && _moraleOverlay.Modulate.G < 0.1f) // Is Red?
                    {
                        _moraleOverlay.Modulate = Colors.Transparent;
                    }
                    else
                    {
                        _moraleOverlay.Modulate = Colors.Red;
                    }
                }
            }
        }

        public void Initialize(string unitId, string unitName, int maxHealth, string category, bool isCommander)
        {
            _maxHealth = maxHealth;
            
            var pixelTex = GetPixelTexture();
             var blueColor = new Color(0, 0.2f, 0.6f);

            // 1. Header (Name Bar) - Top part of T
            _headerBg = new Sprite3D();
            _headerBg.Name = "HeaderBg";
            _headerBg.Texture = pixelTex;
            _headerBg.Modulate = blueColor;
            _headerBg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            // _headerBg.PixelSize = 0.01f; // Default
            _headerBg.NoDepthTest = true;
            // Size: 2.2m wide, 0.5m high. (220 x 50 pixels at 0.01 scale)
            _headerBg.Scale = new Vector3(220, 50, 1);
            _headerBg.Position = new Vector3(0, 3.8f, 0); 
            AddChild(_headerBg);

            // 2. Body (Icon Box) - Bottom vertical part of T
            _bodyBg = new Sprite3D();
            _bodyBg.Name = "BodyBg";
            _bodyBg.Texture = pixelTex;
            _bodyBg.Modulate = blueColor;
            _bodyBg.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _bodyBg.NoDepthTest = true;
            // Size: 1.4m wide, 1.4m high (140 x 140)
            _bodyBg.Scale = new Vector3(140, 140, 1);
            _bodyBg.Position = new Vector3(0, 2.85f, 0); // Below Header (3.8 - 0.25 - 0.7 = 2.85)
            AddChild(_bodyBg);

            // Name Label
            _nameLabel = new Label3D();
            _nameLabel.Name = "NameLabel";
            // Format ID: "sdf_trooper" -> "SDF TROOPER"
            string displayName = unitId.Replace("sdf_", "").Replace("_", " ").ToUpper(); 
             // Determine cleaner name from ID if possible
            _nameLabel.Text = displayName;
            _nameLabel.PixelSize = 0.002f; // High res scale
            _nameLabel.FontSize = 96; // Large font scaled down
            _nameLabel.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _nameLabel.Position = new Vector3(0, 3.8f, 0.05f); // Clearly above header
            _nameLabel.NoDepthTest = true;
            _nameLabel.RenderPriority = 15; // Highest priority text
            _nameLabel.OutlineSize = 8; // Stroke
            _nameLabel.OutlineModulate = Colors.Black; // Outline support
            AddChild(_nameLabel);

            // Unit Icon (Category/Specific)
            _categoryIcon = new Sprite3D();
            _categoryIcon.Name = "UnitIcon";
            _categoryIcon.Texture = LoadUnitIcon(unitId); // Load specific icon
            _categoryIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _categoryIcon.PixelSize = 0.005f; // Adjust scale based on source image size (usually 64 or 128)
            // If 128px * 0.005 = 0.64m. Fits in 1.4m box.
            _categoryIcon.Position = new Vector3(0, 3.0f, 0.01f); // Center of Body
            _categoryIcon.NoDepthTest = true;
            _categoryIcon.RenderPriority = 11;
            AddChild(_categoryIcon);
            
            // HP Bar (Segmented) - Bottom of Body
            _hpBar = new Sprite3D();
            _hpBar.Name = "HPBar";
            _hpBar.Texture = pixelTex; 
            _hpBar.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            // Width matches Body (1.4m = 140 scale). Height 0.2m (20 scale)
            _hpBar.Scale = new Vector3(140, 20, 1); 
            _hpBar.Position = new Vector3(0, 2.25f, 0.02f); // Bottom of Body (2.85 - 0.7 + 0.1 = 2.25)
            _hpBar.NoDepthTest = true;
            _hpBar.RenderPriority = 12;
            
            var shader = GD.Load<Shader>("res://art/shaders/SegmentedHealthBar.gdshader");
            _hpMaterial = new ShaderMaterial();
            _hpMaterial.Shader = shader;
            _hpMaterial.SetShaderParameter("aligned_color", Colors.White);
            _hpMaterial.SetShaderParameter("segments", (float)(maxHealth / 2.0f)); 
            _hpMaterial.SetShaderParameter("fill_amount", 1.0f);
            
            _hpBar.MaterialOverride = _hpMaterial;
            AddChild(_hpBar);
            
            // Suppression/Morale Bar (Yellow Overlay)
            _moraleOverlay = new Sprite3D();
            _moraleOverlay.Name = "MoraleOverlay";
            _moraleOverlay.Texture = pixelTex;
            _moraleOverlay.Modulate = new Color(1, 1, 0, 1.0f); // Yellow
            _moraleOverlay.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            // Initial scale 0. Height matches HP bar? Or above?
            // "yellow bar onto represents how much suppression... At full morrals its not visisble"
            // Let's put it on top of HP bar or slightly above? Reference: "yellow bar onto represents..."
            // Usually superimposed or separate. Let's make it a thin line above HP bar?
            // User said: "At full morrals its not visisble... routed its a full bar."
            _moraleOverlay.Scale = new Vector3(0, 10, 1); 
            _moraleOverlay.Position = new Vector3(-0.7f, 2.45f, 0.03f); // Above HP Bar
            _moraleOverlay.Centered = false; // Grow from left
             // Wait, Sprite3D Centered property applies to texture center.
             // If we want left align growth efficiently:
             // Move pivot? Or adjust position.
             // Let's keep Centered=true (default) and adjust pos in Update.
            _moraleOverlay.Centered = true;
            _moraleOverlay.Position = new Vector3(0, 2.4f, 0.03f);
            
            _moraleOverlay.NoDepthTest = true;
            _moraleOverlay.RenderPriority = 13; 
            AddChild(_moraleOverlay);
            
            // Veterancy
            _veterancyRoot = new Node3D();
            _veterancyRoot.Name = "Veterancy";
             // Top Right of Body
            _veterancyRoot.Position = new Vector3(0.5f, 3.3f, 0.02f); 
            AddChild(_veterancyRoot);
            
            _vetChevrons = new Sprite3D[3];
            var chevTex = GetChevronTexture();
            for(int i=0; i<3; i++) {
                _vetChevrons[i] = new Sprite3D();
                _vetChevrons[i].Texture = chevTex;
                _vetChevrons[i].Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
                _vetChevrons[i].PixelSize = 0.01f;
                _vetChevrons[i].Modulate = Colors.White; // Inherit color logic later
                _vetChevrons[i].Scale = new Vector3(15, 8, 1);
                _vetChevrons[i].Position = new Vector3(0, i * 0.15f, 0);
                _vetChevrons[i].Visible = false;
                _vetChevrons[i].NoDepthTest = true;
                _vetChevrons[i].RenderPriority = 12;
                _veterancyRoot.AddChild(_vetChevrons[i]);
            }
            
            // Commander Aura (Outside box)
            _commanderAuraIcon = new Sprite3D();
            _commanderAuraIcon.Name = "CmdAura";
            // Reuse Chevron for now or Triangle
            _commanderAuraIcon.Texture = chevTex; 
            _commanderAuraIcon.Modulate = Colors.Cyan;
            _commanderAuraIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _commanderAuraIcon.PixelSize = 0.01f;
            _commanderAuraIcon.Scale = new Vector3(30, 30, 1);
            _commanderAuraIcon.Position = new Vector3(1.0f, 3.0f, 0); // To the right of Body
            _commanderAuraIcon.Visible = false;
            _commanderAuraIcon.NoDepthTest = true;
            AddChild(_commanderAuraIcon);
            
            // Initial State Update
            SetSelected(false);
            
        } // End Initialize

        private Texture2D GetChevronTexture()
        {
             var image = Image.CreateEmpty(32, 32, false, Image.Format.Rgba8);
             // Draw Chevron (V shape)
             for(int x=0; x<32; x++)
                for(int y=0; y<32; y++)
                {
                     int centerDist = Mathf.Abs(x - 16);
                     // V shape logic
                     if (y > centerDist && y < centerDist + 6) 
                         image.SetPixel(x, y, new Color(1, 0.84f, 0)); // Gold
                }
             return ImageTexture.CreateFromImage(image);
        }
        
        public void UpdateHealth(int currentHealth)
        {
             float fill = (float)currentHealth / _maxHealth;
             _hpMaterial?.SetShaderParameter("fill_amount", fill);
        }
        
        public void UpdateMorale(float currentMorale, float maxMorale)
        {
             float suppression = 1.0f - (currentMorale / maxMorale);
             // Width matches Body (140)
             float width = 140.0f * suppression;
             _moraleOverlay.Scale = new Vector3(width, 10, 1);
             // Left aligned expansion:
             // Center = LeftEdge + Width/2
             // LeftEdge of Body (width 140) is -70 (scaled). 
             // In world units (x 0.01): -0.7.
             // New Center = -0.7 + (width * 0.01 / 2)
             _moraleOverlay.Position = new Vector3(-0.7f + (width * 0.01f * 0.5f), 2.4f, 0.03f);
        }

        public void SetRouting(bool routing)
        {
            if (_isRouting == routing) return;
            
            _isRouting = routing;
            if (!_isRouting)
            {
                if (_moraleOverlay != null)
                {
                    _moraleOverlay.Modulate = new Color(1, 1, 0, 1.0f); // Reset to Yellow
                    _moraleOverlay.Visible = true; // Make sure it's visible (width determines visual)
                }
            }
            else
            {
                 // Routing starts
                 if (_moraleOverlay != null)
                 {
                     _moraleOverlay.Modulate = Colors.Red;
                     _blinkTimer = 0; // Start blinking immediately
                 }
            }
        }
        
        public void SetVeterancy(int rank)
        {
            if (_vetChevrons == null) return;
            for(int i=0; i<3; i++)
            {
                _vetChevrons[i].Visible = (rank > i);
            }
        }
        
        public void SetBuffStatus(bool buffed)
        {
            if (_commanderAuraIcon != null) _commanderAuraIcon.Visible = buffed;
        }

        public void SetSelected(bool selected)
        {
            _isSelected = selected;
            
            Color bgCol = _isSelected ? Colors.White : new Color(0, 0.2f, 0.6f);
            Color fgCol = _isSelected ? new Color(0, 0.2f, 0.6f) : Colors.White;
            
            if (_headerBg != null) _headerBg.Modulate = bgCol;
            if (_bodyBg != null) _bodyBg.Modulate = bgCol;
            
            if (_nameLabel != null) _nameLabel.Modulate = fgCol;
            if (_categoryIcon != null) _categoryIcon.Modulate = fgCol;
            
            // Chevrons should probably contrast? 
            // If BG is White, Chevrons (Gold/White) might disappear.
            // Let's make Chevrons always Gold or swap too. Reference shows Grey/Silver?
            // User image 1: Blue BG, Greyish Chevrons.
            // User image 2: White BG, Blue Chevrons? (Hard to see, maybe Dark Blue)
            // Let's use fgCol for chevrons.
            if (_vetChevrons != null)
            {
                foreach(var c in _vetChevrons) c.Modulate = fgCol;
            }
        }
        
        private Texture2D LoadUnitIcon(string unitId)
        {
            // Try specific unit icon
            // Expected path: res://assets/icons/units/sdf/unit_id.png
            // We don't know the folder structure perfectly (sdf/vanguard). 
            // But we know finding files...
            // Let's attempt to use a utility or finding.
            // Since we can't perform IO search at runtime easily without expensive Directory traversal,
            // we will try to construct paths.
            
            // Hack for prototype: check generic known paths?
            // "assets/icons/units/sdf/{unitId}.png" 
            
            string faction = unitId.StartsWith("sdf") ? "sdf" : "vanguard"; // Default guessing
            if (unitId.Contains("vanguard")) faction = "vanguard"; // Confirm
            
            // Try Loading
            // Note: Godot requires existing import. If files are not in project, this fails.
            // Assuming I will move them to game/assets/...
            
            string pathPng = $"res://assets/icons/units/{faction}/{unitId}.png";
            string pathJpg = $"res://assets/icons/units/{faction}/{unitId}.jpg";
            
            if (ResourceLoader.Exists(pathPng)) 
            {
                try { return GD.Load<Texture2D>(pathPng); } catch {}
            }
            if (ResourceLoader.Exists(pathJpg)) 
            {
                 try { return GD.Load<Texture2D>(pathJpg); } catch {}
            }
            
            // Try Loading Generic Class
            // Inf -> militia
            // Tank -> mbt
            string genericName = "";
            if (unitId.Contains("trooper") || unitId.Contains("infantry")) genericName = "sdf_militia";
            if (unitId.Contains("tank") || unitId.Contains("mbt")) genericName = "sdf_bastion_mbt";
            if (unitId.Contains("scout")) genericName = "vanguard_10th_scout"; // generic icon
            
            if (!string.IsNullOrEmpty(genericName))
            {
                string genPathPng = $"res://assets/icons/units/{faction}/{genericName}.png";
                string genPathJpg = $"res://assets/icons/units/{faction}/{genericName}.jpg";
                if (ResourceLoader.Exists(genPathPng)) return GD.Load<Texture2D>(genPathPng);
                if (ResourceLoader.Exists(genPathJpg)) return GD.Load<Texture2D>(genPathJpg);
            }

            // Generate Pink Question Mark Placeholder
            var image = Image.CreateEmpty(64, 64, false, Image.Format.Rgba8);
            image.Fill(new Color(1, 0.4f, 0.7f)); // Pink
            
            // Draw "?" (Simple pixels)
            Color qColor = Colors.White;
            // Top Bar
            for(int x=20; x<44; x++) 
                for(int y=10; y<15; y++) image.SetPixel(x, y, qColor);
            // Right Side
            for(int x=40; x<45; x++) 
                for(int y=15; y<30; y++) image.SetPixel(x, y, qColor);
            // Middle Horizontal
            for(int x=20; x<45; x++) 
                for(int y=30; y<35; y++) image.SetPixel(x, y, qColor);
            // Vertical Down
            for(int x=20; x<25; x++) 
                for(int y=35; y<45; y++) image.SetPixel(x, y, qColor);
             // Dot
            for(int x=20; x<25; x++) 
                for(int y=50; y<55; y++) image.SetPixel(x, y, qColor);

            return ImageTexture.CreateFromImage(image); 
        }

        private ImageTexture GetPixelTexture()
        {
            var image = Image.CreateEmpty(1, 1, false, Image.Format.Rgba8);
            image.SetPixel(0, 0, Colors.White);
            return ImageTexture.CreateFromImage(image);
        }
    }
}
