using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class UnitSelectionPanel : Control
{
    private VBoxContainer _mainContainer;
    
    // Primary Card Elements
    private Control _primaryCard;
    private TextureRect _unitIcon;
    private Label _unitName;
    private ProgressBar _hpBar;
    private Label _ammoLabel;
    private Label _speedLabel; // Extra stat
    private Label _ammoCount; // Detailed ammo
    
    // Group List Elements
    private HBoxContainer _groupListContainer;
    private Dictionary<string, Button> _groupButtons = new Dictionary<string, Button>();

    private Unit _currentUnit;

    public override void _Ready()
    {
        // Anchor Bottom Left
        SetAnchorsPreset(LayoutPreset.BottomLeft);
        Position = new Vector2(20, -220); // Offset up from bottom
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
        
        _unitName = new Label();
        _unitName.Text = "UNIT NAME";
        _unitName.AddThemeFontSizeOverride("font_size", 24);
        detailsVBox.AddChild(_unitName);
        
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
        _ammoLabel = new Label();
        detailsVBox.AddChild(_ammoLabel);
        
        _speedLabel = new Label();
        detailsVBox.AddChild(_speedLabel);
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
        if (SelectionManager.Instance == null) return;
        
        var primary = SelectionManager.Instance.GetPrimaryUnit();
        
        if (IsInstanceValid(primary))
        {
            Visible = true;
            _currentUnit = primary;
            
            _unitName.Text = primary.Data.Id.ToUpper().Replace("SDF_", "").Replace("_", " ");
            
            // Icon Logic (Reuse UnitUI logic or similar)
            _unitIcon.Texture = LoadUnitIcon(primary.Data.Id);
            
            // Stats
            float speed = primary.Data.Speed.Road > 0 ? primary.Data.Speed.Road : 30;
            _speedLabel.Text = $"Speed: {speed} km/h";
            
            _ammoLabel.Text = $"Rank: {primary.Rank}"; // Placeholder for ammo access
            
            // Update Group List
            UpdateGroupList();
        }
        else
        {
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
            btn.CustomMinimumSize = new Vector2(40, 40);
            
            // Icon
            var icon = LoadUnitIcon(typeId);
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

    // Copied from UnitUI (Should be in a utility class ideally)
    private Texture2D LoadUnitIcon(string unitId)
    {
        string faction = unitId.StartsWith("sdf") ? "sdf" : "vanguard";
        if (unitId.Contains("vanguard")) faction = "vanguard";
        
        string pathPng = $"res://assets/icons/units/{faction}/{unitId}.png";
        string pathJpg = $"res://assets/icons/units/{faction}/{unitId}.jpg";
        
        if (ResourceLoader.Exists(pathPng)) return GD.Load<Texture2D>(pathPng);
        if (ResourceLoader.Exists(pathJpg)) return GD.Load<Texture2D>(pathJpg);
        
        // Fallback
        return null; // Or placeholder
    }
}
