using Godot;
using WarYes.Data;

public partial class DeckStripItem : PanelContainer
{
    private StyleBoxFlat _panelStyle;
    
    private Control _unitInfo;
    private Label _emptyLabel;
    
    private TextureRect _unitIcon;
    private Label _nameLabel;
    private Label _deployCostLabel;
    private Label _countLabel;
    // private TextureRect _vetIcon; // Removed in favor of interactive buttons

    [Signal]
    public delegate void DecorationClickedEventHandler();
    
    [Signal]
    public delegate void VeterancyChangedEventHandler(int level);
    
    [Signal]
    public delegate void TransportClickedEventHandler();

    [Signal]
    public delegate void TransportHoveredEventHandler();
    
    [Signal]
    public delegate void TransportExitedEventHandler();

    private HBoxContainer _transportBar;
    private TextureRect _transportIcon;
    private Label _transportName;
    
    // Veterancy UI
    private VBoxContainer _veterancyContainer;
    private ButtonGroup _vetGroup;
    public int SelectedVeterancy { get; private set; }

    public override void _Ready()
    {
        // Duplicate stylebox to allow unique colors per item
        if (GetThemeStylebox("panel") is StyleBoxFlat sb)
        {
            _panelStyle = (StyleBoxFlat)sb.Duplicate();
            AddThemeStyleboxOverride("panel", _panelStyle);
        }

        var content = GetNode<Control>("Content");
        _unitInfo = GetNode<VBoxContainer>("Content/UnitInfo");
        _emptyLabel = GetNode<Label>("Content/EmptyLabel");
        
        // --- GRAB REFERENCES ---
        _unitIcon = GetNode<TextureRect>("Content/UnitInfo/UnitIcon");
        _nameLabel = GetNode<Label>("Content/UnitInfo/NameLabel");
        _deployCostLabel = GetNode<Label>("Content/UnitInfo/InfoBar/DeployCostLabel");
        _countLabel = GetNode<Label>("Content/UnitInfo/StatsBar/CountLabel");
        _transportBar = GetNode<HBoxContainer>("Content/UnitInfo/TransportBar");
        _transportIcon = GetNode<TextureRect>("Content/UnitInfo/TransportBar/TransportIcon");
        _transportName = GetNode<Label>("Content/UnitInfo/TransportBar/TransportName");

        // 0. square profile
        CustomMinimumSize = new Vector2(150, 150); 
        SizeFlagsVertical = SizeFlags.ShrinkCenter; // Don't stretch to fill 220px container
        ClipContents = true; // Ensure image doesn't spill if it decides to be large
        
        // 1. Unit Icon -> Background
        _unitIcon.Reparent(content);
        _unitIcon.LayoutMode = 1; // Anchors
        _unitIcon.AnchorsPreset = (int)Control.LayoutPreset.FullRect;
        _unitIcon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize; // Fill
        _unitIcon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCovered; // Crop to fill
        content.MoveChild(_unitIcon, 0); // Behind everything

        // 2. Cost -> Top Right Overlay
        _deployCostLabel.Reparent(content);
        _deployCostLabel.LayoutMode = 1;
        _deployCostLabel.AnchorsPreset = (int)Control.LayoutPreset.TopRight;
        _deployCostLabel.Position = new Vector2(-40, 5); // Offset manually or use margins
        _deployCostLabel.GrowHorizontal = Control.GrowDirection.Begin;
        _deployCostLabel.AddThemeColorOverride("font_outline_color", Colors.Black);
        _deployCostLabel.AddThemeConstantOverride("outline_size", 4);
        _deployCostLabel.AddThemeColorOverride("font_color", new Color(1, 0.8f, 0)); // Gold

        // 3. Count -> Mid Left Overlay
        _countLabel.Reparent(content);
        _countLabel.LayoutMode = 1;
        _countLabel.AnchorsPreset = (int)Control.LayoutPreset.CenterLeft;
        _countLabel.SetAnchorsPreset(Control.LayoutPreset.CenterLeft);
        _countLabel.Position = new Vector2(5, 0); 
        _countLabel.AddThemeColorOverride("font_outline_color", Colors.Black);
        _countLabel.AddThemeConstantOverride("outline_size", 4);

        // 4. Veterancy -> Top Right (Below Cost?) or Right Column
        // Create container in Content
        var vetPanel = new PanelContainer();
        vetPanel.Name = "VeterancyPanel";
        var vetStyle = new StyleBoxFlat();
        vetStyle.BgColor = new Color(0, 0, 0, 0.4f);
        vetStyle.CornerRadiusTopLeft = 4;
        vetStyle.CornerRadiusTopRight = 4;
        vetStyle.CornerRadiusBottomLeft = 4;
        vetStyle.CornerRadiusBottomRight = 4;
        vetPanel.AddThemeStyleboxOverride("panel", vetStyle);
        
        content.AddChild(vetPanel);
        
        vetPanel.LayoutMode = 1;
        vetPanel.AnchorsPreset = (int)Control.LayoutPreset.CenterRight;
        vetPanel.SetAnchorsPreset(Control.LayoutPreset.CenterRight);
        vetPanel.Position += new Vector2(-2, 0); // Slight padding

        _veterancyContainer = new VBoxContainer();
        _veterancyContainer.Name = "VeterancyContainer";
        _veterancyContainer.AddThemeConstantOverride("separation", 0);
        _veterancyContainer.Alignment = BoxContainer.AlignmentMode.Center;
        
        vetPanel.AddChild(_veterancyContainer);

        // 5. Bottom Overlay (Name + Transport)
        var bottomPanel = new PanelContainer();
        var bottomStyle = new StyleBoxFlat();
        bottomStyle.BgColor = new Color(0, 0, 0, 0.6f); // Semi-transparent black
        bottomPanel.AddThemeStyleboxOverride("panel", bottomStyle);
        content.AddChild(bottomPanel);
        
        bottomPanel.LayoutMode = 1;
        bottomPanel.AnchorsPreset = (int)Control.LayoutPreset.BottomWide;
        bottomPanel.SetAnchorsPreset(Control.LayoutPreset.BottomWide);
        bottomPanel.GrowVertical = Control.GrowDirection.Begin;
        
        var bottomVBox = new VBoxContainer();
        bottomVBox.AddThemeConstantOverride("separation", 0);
        bottomPanel.AddChild(bottomVBox);

        _transportBar.Reparent(bottomVBox);
        _transportBar.Alignment = BoxContainer.AlignmentMode.Center;
        
        _nameLabel.Reparent(bottomVBox);
        _nameLabel.HorizontalAlignment = HorizontalAlignment.Center;
        _nameLabel.AddThemeConstantOverride("outline_size", 2); // Readable text

        // Clean up old parents if needed, but Reparent handles removing from old.
        // Hide the original VBox wrapper as it is now empty/useless
        _unitInfo.Visible = false; 

        // Connect inputs
        _transportBar.GuiInput += OnTransportGuiInput;
        _transportBar.MouseEntered += () => EmitSignal(SignalName.TransportHovered);
        _transportBar.MouseExited += () => EmitSignal(SignalName.TransportExited);
        
        _vetGroup = new ButtonGroup();
        GuiInput += OnGuiInput;
    }

    private void OnGuiInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Right)
        {
            // Only allow removing if filled
            if (_unitIcon.Visible) 
            {
                EmitSignal(SignalName.DecorationClicked);
            }
        }
    }
    
    private void OnTransportGuiInput(InputEvent @event)
    {
         if (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left)
        {
             EmitSignal(SignalName.TransportClicked);
        }
    }

    public void SetupFilled(UnitCard card, DivisionRosterEntry entry)
    {
        // _unitInfo.Visible = true; // No longer using this container visibility
        _emptyLabel.Visible = false;
        
        // Show our reparented controls
        _unitIcon.Visible = true;
        _nameLabel.Visible = true;
        _deployCostLabel.Visible = true;
        _countLabel.Visible = true;
        // _veterancyContainer.Visible = true; // Managed by children

        if (_panelStyle != null) _panelStyle.BgColor = new Color(0.2f, 0.22f, 0.25f, 1f); // Default dark

        _nameLabel.Text = card.Data.Name.ToUpper();
        _deployCostLabel.Text = card.Cost.ToString();
        _countLabel.Text = $"x{card.AvailableCount}";
        
        // Icon
        _unitIcon.Texture = WarYes.Utils.IconLoader.LoadUnitIcon(card.Data);

        // Veterancy Buttons
        SetupVeterancyButtons(entry, card.Veterancy);
        
        // Transport Info
         if (!string.IsNullOrEmpty(card.TransportId))
        {
             var global = GameGlobal.Instance;
             if (global.UnitLibrary.ContainsKey(card.TransportId))
             {
                 var transData = global.UnitLibrary[card.TransportId];
                 _transportBar.Visible = true;
                 _transportName.Text = transData.Name.ToUpper();
                 
                 // Smart Icon
                 bool hasArmor = (transData.Armor.Front > 0 || transData.Armor.Side > 0);
                 string cat = hasArmor ? "APC" : "TRUCK";
                 _transportIcon.Texture = WarYes.Utils.IconLoader.LoadCategoryIcon(cat);
             }
             else
             {
                 _transportBar.Visible = false;
             }
        }
        else
        {
            _transportBar.Visible = false;
        }
    }
    
    private void SetupVeterancyButtons(DivisionRosterEntry entry, int currentVeterancy)
    {
        foreach(Node child in _veterancyContainer.GetChildren()) child.QueueFree();

        string[] vetKeys = ["rookie", "trained", "veteran", "elite"];

        // Render Top to Bottom (3 down to 0)
        for(int i=3; i>=0; i--) 
        {
            string key = vetKeys[i];
            bool isAvailable = entry.Availability.ContainsKey(key) && entry.Availability[key] > 0;

            var btn = new Button();
            btn.ToggleMode = true;
            btn.ButtonGroup = _vetGroup;
            // Smaller size for deck strip
            btn.CustomMinimumSize = new Vector2(20, 16); 
            btn.ThemeTypeVariation = "FlatButton"; 
            
            var icon = new TextureRect();
            icon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize;
            icon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered;
            icon.LayoutMode = 1; 
            icon.AnchorsPreset = (int)Control.LayoutPreset.FullRect;
            icon.Texture = WarYes.Utils.IconLoader.LoadVeterancyIcon(i);
            
            btn.AddChild(icon);

            if (!isAvailable)
            {
                btn.Disabled = true;
                btn.Modulate = Colors.Black; 
                icon.Visible = false; 
            }
            else
            {
                int level = i;
                btn.Pressed += () => 
                {
                    SelectedVeterancy = level;
                    EmitSignal(SignalName.VeterancyChanged, level);
                };
            }

            _veterancyContainer.AddChild(btn);
            
            if (i == currentVeterancy)
            {
                btn.SetPressedNoSignal(true);
                SelectedVeterancy = i;
            }
        }
    }

    public void SetupEmpty(int cost, bool isNext)
    {
        // _unitInfo.Visible = false; 
        _emptyLabel.Visible = true;
        
        // Hide reparented controls
        if (_unitIcon != null) _unitIcon.Visible = false;
        if (_nameLabel != null) _nameLabel.Visible = false;
        if (_deployCostLabel != null) _deployCostLabel.Visible = false;
        if (_countLabel != null) _countLabel.Visible = false;
        if (_transportBar != null) _transportBar.Visible = false;
        if (_veterancyContainer != null) 
        {
            foreach(Node child in _veterancyContainer.GetChildren()) child.QueueFree();
        }
        
        _emptyLabel.Text = cost.ToString();
        
        if (_panelStyle != null)
        {
            if (isNext)
            {
                _panelStyle.BgColor = new Color(0.1f, 0.4f, 0.6f, 0.8f); // Blueish
            }
            else
            {
                _panelStyle.BgColor = new Color(0.2f, 0.2f, 0.2f, 0.5f); // Grey
            }
        }
    }
}
