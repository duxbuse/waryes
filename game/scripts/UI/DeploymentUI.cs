using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class DeploymentUI : Control
{
    private HBoxContainer _cardContainer;

    private HBoxContainer _tabContainer;
    private Label _creditsLabel;
    private Button _launchButton;
    
    // Categories matching Wargame/Warno style
    private readonly string[] _categories = { "LOG", "INF", "TNK", "REC", "AA", "ART", "HEL", "AIR" };
    private string _currentCategory = "INF"; // Default

    public override void _Ready()
    {
        Vector2 viewportSize = GetViewportRect().Size;
        // 1. Credits Label
        _creditsLabel = new Label();
        _creditsLabel.Position = new Vector2(viewportSize.X - 350, 25);
        AddChild(_creditsLabel);

        // Terminate / Launch Button
        _launchButton = new Button();
        _launchButton.Text = "Launch Battle";
        _launchButton.Position = new Vector2(viewportSize.X - 220, 20); // Moved Left to clear Settings (TopRight)
        _launchButton.Size = new Vector2(130, 40);
        _launchButton.Pressed += OnLaunchPressed;
        AddChild(_launchButton);

        // 2. Tab Container (Top Left)
        _tabContainer = new HBoxContainer();
        _tabContainer.Position = new Vector2(20, 20);
        _tabContainer.Size = new Vector2(viewportSize.X - 400, 40); // Reduced width to avoid overlapping Credits/Launch
        _tabContainer.AddThemeConstantOverride("separation", 10);
        AddChild(_tabContainer);
        
        CreateTabs();

        // 3. Card Container (Below Tabs)
        _cardContainer = new HBoxContainer();
        _cardContainer.Position = new Vector2(20, 70);
        _cardContainer.Size = new Vector2(viewportSize.X - 40, 130);
        AddChild(_cardContainer);
        
        // Connect to Economy Signals later via GameManager
        
        // Wait for Deck to be ready
        CallDeferred(nameof(InitializeDeck));
    }
    
    public override void _Process(double delta)
    {
        if (GameManager.Instance?.EconomyManager != null)
        {
            _creditsLabel.Text = $"Credits: {GameManager.Instance.EconomyManager.CurrentCredits}";
        }
    }

    private void InitializeDeck()
    {
        var deck = GameManager.Instance?.PlayerDeck;
        if (deck == null)
        {
             GD.PrintErr("DeploymentUI: No deck found!");
             return;
        }

        foreach (var card in deck.Cards)
        {
            // Infer Category if missing
            if (string.IsNullOrEmpty(card.Data.Category))
            {
                // We need to modify the copy in the list? UnitCard is a class (ref type), so yes.
                // But UnitData is a STRUCT. modifying card.Data.Category won't work directly if accessed via property?
                // Wait, UnitCard.Data is a property returning the struct. 
                // We need to copy, modify, assign back.
                var data = card.Data;
                data.Category = InferCategory(data.Id);
                card.Data = data;
            }
            
            CreateCardButton(card);
        }
        
        // Filter initially
        FilterCards(_currentCategory);
    }
    
    private void CreateTabs()
    {
        foreach (var cat in _categories)
        {
            var btn = new Button();
            btn.Text = cat;
            btn.FocusMode = FocusModeEnum.None; // Prevent Tab Index stealing
            btn.CustomMinimumSize = new Vector2(80, 40);
            btn.Pressed += () => FilterCards(cat);
            _tabContainer.AddChild(btn);
        }
    }
    
    private void FilterCards(string category)
    {
        _currentCategory = category;
        
        foreach (var kvp in _cardButtons)
        {
            var card = kvp.Key;
            var button = kvp.Value;
            
            bool match = card.Data.Category == category;
            button.Visible = match;
        }
    }

    private string InferCategory(string id)
    {
        id = id.ToLower();
        
        if (id.Contains("log") || id.Contains("supply") || id.Contains("fob") || id.Contains("truck")) return "LOG";
        if (id.Contains("trooper") || id.Contains("militia") || id.Contains("hwt") || id.Contains("inf") || id.Contains("marine") || id.Contains("commando")) return "INF";
        if (id.Contains("scout") || id.Contains("recon") || id.Contains("sniper") || id.Contains("uav")) return "REC";
        if (id.Contains("tank") || id.Contains("mbt") || id.Contains("armor")) return "TNK"; // Walker?
        
        // Specific checks for mixed types (Walker can be REC or TNK usually)
        if (id.Contains("walker")) return "TNK"; 
        
        if (id.Contains("aa") || id.Contains("skysweeper") || id.Contains("missile_aa") || id.Contains("air_defense")) return "AA";
        if (id.Contains("artillery") || id.Contains("mortar") || id.Contains("howitzer") || id.Contains("bombast") || id.Contains("tremor") || id.Contains("field_gun")) return "ART";
        
        if (id.Contains("heli") || id.Contains("gunship") || id.Contains("vtol") || id.Contains("transport_air")) return "HEL";
        if (id.Contains("jet") || id.Contains("fighter") || id.Contains("bomber") || id.Contains("asf") || id.Contains("air")) return "AIR";
        
        return "INF"; // Fallback to Infantry
    }

    private Dictionary<UnitCard, Button> _cardButtons = new Dictionary<UnitCard, Button>();

    private void CreateCardButton(UnitCard card)
    {
        var button = new Button();
        button.CustomMinimumSize = new Vector2(100, 120);
        button.FocusMode = FocusModeEnum.None;
        button.ClipContents = true; // Ensure image doesn't spill
        
        // Background / Icon
        var icon = new TextureRect();
        icon.Name = "Icon";
        icon.Texture = WarYes.Utils.IconLoader.LoadUnitIcon(card.Data);
        icon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize;
        icon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCovered;
        icon.SetAnchorsPreset(LayoutPreset.FullRect);
        icon.MouseFilter = MouseFilterEnum.Ignore;
        button.AddChild(icon);
        
        // Dimmer Gradient (Optional, but good for text contrast)
        var dimmer = new Panel();
        dimmer.MouseFilter = MouseFilterEnum.Ignore;
        dimmer.SetAnchorsPreset(LayoutPreset.FullRect);
        var style = new StyleBoxFlat();
        style.BgColor = new Color(0, 0, 0, 0.4f);
        dimmer.AddThemeStyleboxOverride("panel", style);
        button.AddChild(dimmer);

        // Cost (Top Left)
        var costLabel = new Label();
        costLabel.Name = "CostLabel";
        costLabel.Text = card.Cost.ToString();
        costLabel.Position = new Vector2(5, 5);
        costLabel.AddThemeColorOverride("font_color", Colors.Yellow);
        costLabel.AddThemeFontSizeOverride("font_size", 14);
        costLabel.MouseFilter = MouseFilterEnum.Ignore;
        button.AddChild(costLabel);

        // Veterancy (Top Right)
        var vetIcon = new TextureRect();
        vetIcon.Name = "VetIcon";
        vetIcon.Texture = WarYes.Utils.IconLoader.LoadVeterancyIcon(card.Veterancy);
        vetIcon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize;
        vetIcon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered;
        vetIcon.SetAnchorsPreset(LayoutPreset.TopRight);
        vetIcon.Size = new Vector2(24, 20);
        vetIcon.Position = new Vector2(100 - 24 - 2, 2); // Manual offset or use anchors
        vetIcon.MouseFilter = MouseFilterEnum.Ignore;
        button.AddChild(vetIcon);

        // Name (Bottom Center/Left)
        var nameLabel = new Label();
        nameLabel.Name = "NameLabel";
        nameLabel.Text = card.UnitId.Replace("sdf_", "").Replace("_", " ").ToUpper();
        nameLabel.SetAnchorsPreset(LayoutPreset.BottomWide);
        nameLabel.HorizontalAlignment = HorizontalAlignment.Center;
        nameLabel.VerticalAlignment = VerticalAlignment.Bottom;
        nameLabel.AddThemeFontSizeOverride("font_size", 12);
        nameLabel.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        nameLabel.MouseFilter = MouseFilterEnum.Ignore;
        // Move up slightly to make room for Count? Or Count overlays?
        // Let's put Name at bottom, Count above it or overlaid.
        button.AddChild(nameLabel);

        // Count (Center? Or Overlay?)
        var countLabel = new Label();
        countLabel.Name = "CountLabel";
        // Logic will be in UpdateButtonVisuals
        countLabel.SetAnchorsPreset(LayoutPreset.Center);
        countLabel.AddThemeFontSizeOverride("font_size", 24);
        countLabel.MouseFilter = MouseFilterEnum.Ignore;
        button.AddChild(countLabel);

        UpdateCardVisualsInternal(button, card);
        
        button.Pressed += () => OnCardPressed(card);
        _cardContainer.AddChild(button);
        _cardButtons[card] = button;
    }
    
    public void UpdateCardVisuals(UnitCard card)
    {
        if (_cardButtons.ContainsKey(card))
        {
            UpdateCardVisualsInternal(_cardButtons[card], card);
        }
    }

    private void UpdateCardVisualsInternal(Button but, UnitCard card)
    {
        var countLabel = but.GetNode<Label>("CountLabel");
        
        if (card.AvailableCount <= 0)
        {
            but.Disabled = true;
            but.Modulate = new Color(0.5f, 0.5f, 0.5f, 0.5f);
            countLabel.Text = "0";
            countLabel.AddThemeColorOverride("font_color", Colors.Red);
        }
        else
        {
            but.Disabled = false;
            but.Modulate = Colors.White;
            countLabel.Text = $"{card.AvailableCount}"; // Just show remaining count prominently
            countLabel.RemoveThemeColorOverride("font_color");
        }
    }

    private void OnCardPressed(UnitCard card)
    {
        GD.Print($"DeploymentUI: Selected {card.UnitId}");
        
        if (GameManager.Instance != null)
        {
            // If already selecting same card, maybe simple cancel?
            GameManager.Instance.SelectedCardForPlacement = card;
        }
    }
    private void OnLaunchPressed()
    {
         GD.Print("DeploymentUI: Launch Button Pressed!");
         if (GameManager.Instance != null && GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup)
         {
             GameManager.Instance.StartBattle();
         }
         else
         {
             GD.Print($"DeploymentUI: Launch Ignored. GM: {GameManager.Instance}, Phase: {GameManager.Instance?.CurrentPhase}");
         }
    }
    
    public void OnBattleStarted()
    {
        if (_launchButton != null)
        {
            _launchButton.Visible = false; // Disable or Hide
            // _launchButton.Text = "Battle Active";
            // _launchButton.Disabled = true;
        }
    }
    
}
