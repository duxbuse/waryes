using Godot;
using System.Collections.Generic;

public partial class SkirmishSetup : Control
{
    private OptionButton _deckOption;
    private Button _startButton;
    private Button _backButton;
    
    private List<string> _availableDecks;

    public override void _Ready()
    {
        _deckOption = GetNode<OptionButton>("Panel/VBoxContainer/DeckOptionButton");
        _startButton = GetNode<Button>("Panel/VBoxContainer/StartButton");
        _backButton = GetNode<Button>("Panel/VBoxContainer/BackButton");

        _startButton.Pressed += OnStartPressed;
        _backButton.Pressed += OnBackPressed;
        
        RefreshDecks();
    }

    private void RefreshDecks()
    {
        _deckOption.Clear();
        _availableDecks = DeckIO.GetSavedDeckNames();
        
        if (_availableDecks.Count == 0)
        {
            _deckOption.AddItem("No Decks Found");
            _startButton.Disabled = true;
            return;
        }

        foreach (var deckName in _availableDecks)
        {
            _deckOption.AddItem(deckName);
        }
        
        _startButton.Disabled = false;
    }

    private void OnStartPressed()
    {
        if (_availableDecks == null || _availableDecks.Count == 0 || _deckOption.Selected < 0) return;
        
        string selectedDeckName = _availableDecks[_deckOption.Selected];
        var deck = DeckIO.LoadDeck(selectedDeckName);
        
        if (deck != null)
        {
            GameGlobal.Instance.HydrateDeck(deck);
            GameGlobal.Instance.SelectedDeck = deck;
            GameGlobal.Instance.ChangeScene("res://scenes/MainMap.tscn");
        }
        else
        {
            GD.PrintErr("SkirmishSetup: Failed to load selected deck.");
        }
    }

    private void OnBackPressed()
    {
        GameGlobal.Instance.ChangeScene("res://scenes/UI/MainMenu.tscn");
    }
}
