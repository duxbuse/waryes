using Godot;
using System;

namespace WarYes.UI
{
    public partial class UnitUI : Node3D
    {
        // Configuration
        private const float SCALE_FACTOR = 0.006f; 

        // Nodes
        // Overhead elements removed
        private Node3D _veterancyRoot;
        private Sprite3D[] _vetChevrons;
        private Sprite3D _commanderAuraIcon;
        private Sprite3D _moraleOverlay; 
        private Sprite3D _transportIcon; // New Icon
        private Sprite3D _hpBar; // Segmented
        private ShaderMaterial _hpMaterial;
        
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

            // HP Bar (Segmented) - Floating above unit
            _hpBar = new Sprite3D();
            _hpBar.Name = "HPBar";
            _hpBar.Texture = pixelTex; 
            _hpBar.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            // Scale: 140 width -> 1.4m. Keep visually consistent size.
            _hpBar.Scale = new Vector3(140, 20, 1); 
            // Position: Just above unit model (approx 2.5m up)
            _hpBar.Position = new Vector3(0, 2.5f, 0); 
            _hpBar.NoDepthTest = true;
            _hpBar.RenderPriority = 12;
            
            var shader = GD.Load<Shader>("res://art/shaders/SegmentedHealthBar.gdshader");
            _hpMaterial = new ShaderMaterial();
            _hpMaterial.Shader = shader;
            _hpMaterial.SetShaderParameter("aligned_color", new Color(0, 1, 0)); // Green HP by default
            _hpMaterial.SetShaderParameter("segments", (float)(maxHealth / 2.0f)); 
            _hpMaterial.SetShaderParameter("fill_amount", 1.0f);
            
            _hpBar.MaterialOverride = _hpMaterial;
            AddChild(_hpBar);
            
            // Morale Bar (Yellow Overlay)
            _moraleOverlay = new Sprite3D();
            _moraleOverlay.Name = "MoraleOverlay";
            _moraleOverlay.Texture = pixelTex;
            _moraleOverlay.Modulate = new Color(1, 1, 0, 1.0f); // Yellow
            _moraleOverlay.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            
            // Positioning above HP Bar
            _moraleOverlay.Scale = new Vector3(0, 10, 1); 
            _moraleOverlay.Centered = true;
            _moraleOverlay.Position = new Vector3(0, 2.65f, 0.01f); // Slightly above HP
            
            _moraleOverlay.NoDepthTest = true;
            _moraleOverlay.RenderPriority = 13; 
            AddChild(_moraleOverlay);
            
            // Veterancy
            _veterancyRoot = new Node3D();
            _veterancyRoot.Name = "Veterancy";
             // Top Right of HP bar area
            _veterancyRoot.Position = new Vector3(0.8f, 2.8f, 0.02f); 
            AddChild(_veterancyRoot);
            
            _vetChevrons = new Sprite3D[3];
            var chevTex = GetChevronTexture();
            for(int i=0; i<3; i++) {
                _vetChevrons[i] = new Sprite3D();
                _vetChevrons[i].Texture = chevTex;
                _vetChevrons[i].Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
                _vetChevrons[i].PixelSize = 0.01f;
                _vetChevrons[i].Modulate = Colors.White; 
                // Smaller size as requested (25% of previous 8, 5)
                _vetChevrons[i].Scale = new Vector3(2.0f, 1.25f, 1); 
                _vetChevrons[i].Position = new Vector3(0, i * 0.1f, 0);
                _vetChevrons[i].Visible = false;
                _vetChevrons[i].NoDepthTest = true;
                _vetChevrons[i].RenderPriority = 14;
                _veterancyRoot.AddChild(_vetChevrons[i]);
            }
            
            // Commander Aura / Buff Icon
            _commanderAuraIcon = new Sprite3D();
            _commanderAuraIcon.Name = "CmdAura";
            _commanderAuraIcon.Texture = chevTex; // Reuse for now
            _commanderAuraIcon.Modulate = Colors.Cyan;
            _commanderAuraIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _commanderAuraIcon.PixelSize = 0.01f;
            _commanderAuraIcon.Scale = new Vector3(10, 10, 1); // Specific icon size
            _commanderAuraIcon.Position = new Vector3(0.9f, 2.5f, 0); // Side of HP bar
            _commanderAuraIcon.Visible = false;
            _commanderAuraIcon.NoDepthTest = true;
            _commanderAuraIcon.NoDepthTest = true;
            AddChild(_commanderAuraIcon);
            
            // Transport Icon
            _transportIcon = new Sprite3D();
            _transportIcon.Name = "TransportIcon";
            _transportIcon.Texture = chevTex; // Reuse or use specific icon (e.g. circle?)
            _transportIcon.Modulate = Colors.Blue; // Blue for Loaded
            _transportIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _transportIcon.PixelSize = 0.01f;
            _transportIcon.Scale = new Vector3(8, 8, 1);
            _transportIcon.Position = new Vector3(-0.9f, 2.5f, 0); // Left Side of HP bar
            _transportIcon.Visible = false;
            _transportIcon.NoDepthTest = true;
            AddChild(_transportIcon);
            
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
             // Width matches Scale (140)
             float width = 140.0f * suppression;
             _moraleOverlay.Scale = new Vector3(width, 10, 1);
             // To grow from left visually with Centered=True, we shift position
             // Center = LeftEdge + Width/2
             // Reference LeftEdge (approx -0.7)
             _moraleOverlay.Position = new Vector3(-0.7f + (width * 0.01f * 0.5f), 2.65f, 0.01f);
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
                    _moraleOverlay.Visible = true; 
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

        public void SetTransportIcon(bool loaded)
        {
            if (_transportIcon != null) _transportIcon.Visible = loaded;
        }

        public void SetSelected(bool selected)
        {
            _isSelected = selected;
            
            // Just visibility Toggle for HP Bar?
            // "Remove it from over the unit itself as it is hiding the hp bar and aiming indicator"
            // Wait, usually HP bar shows only on hover/select or damage? 
            // Or always? 
            // Previous code: SetSelected toggled colors.
            // Requirement usually: Show details on Select.
            // Let's keep HP bar always visible or only on Select/Hover?
            // User didn't specify visibility logic, only removal of "Icon" box.
            // Assuming HP bar remains visible or standard logic.
            // Let's keep it visible for now, or ensure it's visible if needed.
            
            // If we want highlight effect, we can change border?
            // For now, no change needed in SetSelected besides maybe subtle cues.
        }

        private ImageTexture GetPixelTexture()
        {
            var image = Image.CreateEmpty(1, 1, false, Image.Format.Rgba8);
            image.SetPixel(0, 0, Colors.White);
            return ImageTexture.CreateFromImage(image);
        }
    }
}
