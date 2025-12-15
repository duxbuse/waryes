using Godot;
using System.Collections.Generic;
using WarYes.Data;

public partial class DeploymentUI : Control
{
    private HBoxContainer _cardContainer;
    private Label _creditsLabel;

    public override void _Ready()
    {
        // Setup Grid/Layout
        _cardContainer = new HBoxContainer();
        _cardContainer.Position = new Vector2(20, GetViewportRect().Size.Y - 150);
        _cardContainer.Size = new Vector2(GetViewportRect().Size.X - 40, 130);
        AddChild(_cardContainer);
        
        _creditsLabel = new Label();
        _creditsLabel.Position = new Vector2(20, 20);
        AddChild(_creditsLabel);

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
            CreateCardButton(card);
        }
    }

    private Dictionary<UnitCard, Button> _cardButtons = new Dictionary<UnitCard, Button>();

    private void CreateCardButton(UnitCard card)
    {
        var button = new Button();
        button.CustomMinimumSize = new Vector2(100, 120);
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
