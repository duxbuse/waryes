using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class DeploymentUI : Control
{
    private HBoxContainer _cardContainer;
    private HBoxContainer _tabContainer;
    private Label _creditsLabel;
    
    // Categories matching Wargame/Warno style
    private readonly string[] _categories = { "LOG", "INF", "TNK", "REC", "AA", "ART", "HEL", "AIR" };
    private string _currentCategory = "INF"; // Default

    public override void _Ready()
    {
        var viewportSize = GetViewportRect().Size;

        // 1. Credits Label (Top Right or integrated?) - Let's put it Top Right for now
        _creditsLabel = new Label();
        _creditsLabel.Position = new Vector2(viewportSize.X - 200, 20);
        AddChild(_creditsLabel);

        // 2. Tab Container (Top Left)
        _tabContainer = new HBoxContainer();
        _tabContainer.Position = new Vector2(20, 20);
        _tabContainer.Size = new Vector2(viewportSize.X - 250, 40);
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
        button.FocusMode = FocusModeEnum.None; // Prevent Tab Index stealing
        UpdateButtonText(button, card);
        button.Pressed += () => OnCardPressed(card);
        _cardContainer.AddChild(button);
        _cardButtons[card] = button;
    }
    
    public void UpdateCardVisuals(UnitCard card)
    {
        if (_cardButtons.ContainsKey(card))
        {
            UpdateButtonText(_cardButtons[card], card);
        }
    }

    private void UpdateButtonText(Button but, UnitCard card)
    {
        but.Text = $"{card.UnitId}\n{card.Cost} Cr\n{card.AvailableCount}/{card.MaxCount}";
        if (card.AvailableCount <= 0)
        {
            but.Disabled = true;
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
}
