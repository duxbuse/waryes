using Godot;
using System.Collections.Generic;
using WarYes.Data;
using System.Linq;
using WarYes.Utils;

public partial class UnitSelectionPanel : Control
{
    private VBoxContainer _mainContainer;
    
    // Primary Card Elements
    private Control _primaryCard;
    private TextureRect _unitIcon;
    private Label _unitName;
    private TextureRect _veterancyIcon;
    private ProgressBar _hpBar;

    private RichTextLabel _detailsLabel; // Replaces individual labels
    
    // Group List Elements
    private HBoxContainer _groupListContainer;
    private Dictionary<string, Button> _groupButtons = new Dictionary<string, Button>();

    private Unit _currentUnit;

    public override void _Ready()
    {
        // Anchor Bottom Left
        SetAnchorsPreset(LayoutPreset.BottomLeft);
        // Manual offset adjustment to ensure it's on screen
        // Anchor (0,1) is bottom left.
        // We want it slightly up and right.
        Position = new Vector2(20, -220); // Relative to anchor if layout preset works? 
        // Godot Control positioning can be finicky. 
        // Let's use Viewport logic to be safe.
        var vp = GetViewportRect().Size;
        Position = new Vector2(20, vp.Y - 220);
        Size = new Vector2(400, 200);

        // Main Logic
        if (SelectionManager.Instance != null)
        {
            SelectionManager.Instance.OnSelectionChanged += UpdatePanel;
        }
        
        SetupUI();
        UpdatePanel(); // Initial State
    }
    
    public override void _ExitTree()
    {
        if (SelectionManager.Instance != null)
        {
            SelectionManager.Instance.OnSelectionChanged -= UpdatePanel;
        }
    }

    private void SetupUI()
    {
        _mainContainer = new VBoxContainer();
        _mainContainer.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(_mainContainer);
        
        // 1. Group List (Top Strip)
        _groupListContainer = new HBoxContainer();
        _groupListContainer.CustomMinimumSize = new Vector2(0, 40);
        _mainContainer.AddChild(_groupListContainer);
        
        // 2. Primary Card (Main Detail Area)
        _primaryCard = new PanelContainer();
        _primaryCard.CustomMinimumSize = new Vector2(300, 150);
        
        // Style: Dark Panel
        var style = new StyleBoxFlat();
        style.BgColor = new Color(0.1f, 0.1f, 0.1f, 0.9f);
        style.CornerRadiusTopLeft = 5;
        style.CornerRadiusTopRight = 5;
        style.CornerRadiusBottomLeft = 5;
        style.CornerRadiusBottomRight = 5;
        _primaryCard.AddThemeStyleboxOverride("panel", style);
        
        var cardHBox = new HBoxContainer();
        _primaryCard.AddChild(cardHBox);
        _mainContainer.AddChild(_primaryCard);
        
        // Left: Icon
        _unitIcon = new TextureRect();
        _unitIcon.CustomMinimumSize = new Vector2(128, 128);
        _unitIcon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize;
        _unitIcon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered;
        cardHBox.AddChild(_unitIcon);
        
        // Right: Details
        var detailsVBox = new VBoxContainer();
        detailsVBox.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        cardHBox.AddChild(detailsVBox);
        
        // Header (Name + Vet)
        var headerHBox = new HBoxContainer();
        detailsVBox.AddChild(headerHBox);
        
        _unitName = new Label();
        _unitName.Text = "UNIT NAME";
        _unitName.AddThemeFontSizeOverride("font_size", 24);
        _unitName.SizeFlagsHorizontal = SizeFlags.ExpandFill; 
        headerHBox.AddChild(_unitName);

        // Veterancy Icon
        _veterancyIcon = new TextureRect();
        _veterancyIcon.CustomMinimumSize = new Vector2(32, 24); 
        _veterancyIcon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize;
        _veterancyIcon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered;
        headerHBox.AddChild(_veterancyIcon);
        
        // HP
        _hpBar = new ProgressBar();
        _hpBar.CustomMinimumSize = new Vector2(0, 20);
        _hpBar.Step = 1;
        // Style HP Bar Green
        var styleBox = new StyleBoxFlat();
        styleBox.BgColor = new Color(0, 0.8f, 0);
        _hpBar.AddThemeStyleboxOverride("fill", styleBox);
        detailsVBox.AddChild(_hpBar);
        
        // Stats
        _detailsLabel = new RichTextLabel();
        _detailsLabel.BbcodeEnabled = true;
        _detailsLabel.SizeFlagsVertical = SizeFlags.ExpandFill;
        _detailsLabel.FitContent = true; 
        detailsVBox.AddChild(_detailsLabel);
    }
    
    public override void _Process(double delta)
    {
        // Update Dynamic Stats (HP, Ammo) for current unit
        if (IsInstanceValid(_currentUnit))
        {
             _hpBar.Value = _currentUnit.Health;
             _hpBar.MaxValue = _currentUnit.Data.Health > 0 ? _currentUnit.Data.Health : 10;
             
             // Update Ammo if firing
             // Aggregate ammo? Or just primary?
             // Show "Ammo: OK" or "Low"?
             // Let's show first weapon ammo for now
             // Accessing Unit.Weapons is private private List<Weapon> _weapons
             // Unit needs to expose it or a summary.
             // For now, let's just update HP.
        }
    }

    private void UpdatePanel()
    {
        GD.Print("UnitSelectionPanel: UpdatePanel called.");
        if (SelectionManager.Instance == null) return;
        
        var primary = SelectionManager.Instance.GetPrimaryUnit();
        
        if (IsInstanceValid(primary))
        {
            GD.Print($"UnitSelectionPanel: Displaying {primary.Name}");
            Visible = true;
            _currentUnit = primary;
            
            _unitName.Text = primary.Data.Id.ToUpper().Replace("SDF_", "").Replace("_", " ");
            
            // Icon Logic (Reuse UnitUI logic or similar)
            _unitIcon.Texture = IconLoader.LoadUnitIcon(primary.Data);

            // Veterancy
            _veterancyIcon.Texture = IconLoader.LoadVeterancyIcon(primary.Rank);
            
            // Stats
            float speed = primary.Data.Speed.Road > 0 ? primary.Data.Speed.Road : 30;
            
            string text = $"Speed: {speed} km/h\n";
            
            // Weapons
            if (primary.Data.Weapons != null)
            {
                foreach(var w in primary.Data.Weapons)
                {
                     string faction = "vanguard";
                     if (w.WeaponId.ToLower().StartsWith("sdf")) faction = "sdf";
                     string iconPath = $"res://assets/icons/weapons/{faction}/{w.WeaponId}.svg";
                     
                     if (ResourceLoader.Exists(iconPath))
                     {
                        text += $"[img=20]{iconPath}[/img] {w.WeaponId} ";
                     }
                     else
                     {
                        text += $"{w.WeaponId} ";
                     }
                }
            }
            
            _detailsLabel.Text = text;
            
            // Update Group List
            UpdateGroupList();
        }
        else
        {
            GD.Print("UnitSelectionPanel: No primary unit. Hiding.");
            // For debugging, don't hide? No, user needs to see it work.
            Visible = false;
            _currentUnit = null;
        }
    }
    
    private void UpdateGroupList()
    {
        // Clear old buttons
        foreach(var child in _groupListContainer.GetChildren()) child.QueueFree();
        _groupButtons.Clear();
        
        var types = SelectionManager.Instance.GetSelectedTypes();
        var allSelected = SelectionManager.Instance.SelectedUnits;
        
        foreach(var typeId in types)
        {
            int count = 0;
            foreach(var u in allSelected) if (u.Data.Id == typeId) count++;
            
            var btn = new Button();
            btn.FocusMode = FocusModeEnum.None; // Prevent Tab Index
            btn.CustomMinimumSize = new Vector2(40, 40);
            
            // Icon
            Texture2D icon = null;
            var representative = allSelected.FirstOrDefault(u => u.Data.Id == typeId);
            if (representative != null) icon = IconLoader.LoadUnitIcon(representative.Data);
            else icon = IconLoader.LoadUnitIcon(typeId, "INF"); // Fallback if somehow unit not found (unlikely)
            btn.Icon = icon;
            btn.ExpandIcon = true;
            
            // Count overlay? 
            // Button text?
            btn.Text = count.ToString();
            btn.ClipText = true;
            btn.IconAlignment = HorizontalAlignment.Center;
            btn.VerticalIconAlignment = VerticalAlignment.Top;
            
            // Click to select type
            string capturedId = typeId;
            btn.Pressed += () => {
                SelectionManager.Instance.SetPrimaryType(capturedId);
            };
            
            _groupListContainer.AddChild(btn);
        }
    }

    // LoadUnitIcon removed, using WarYes.Utils.IconLoader
}
