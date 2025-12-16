using Godot;
using System;
using System.Collections.Generic;
using System.Linq;
using WarYes.Data;

public partial class DeckBuilderUI : Control
{
    [Export] public PackedScene DeckStripItemScene { get; set; }
    [Export] public PackedScene UnitCardScene { get; set; }
    [Export] public PackedScene DeckFileItemScene { get; set; }

    private OptionButton _factionSelector;
    private OptionButton _divisionSelector;
    private LineEdit _deckNameInput;
    private Label _pointsLabel;
    private HBoxContainer _deckStripContainer;
    private HBoxContainer _categoryTabs;
    private Container _libraryGrid;
    private RichTextLabel _statsLabel;
    
    private Window _transportPopup;
    private Container _transportGrid;
    
    private Window _loadDeckPopup;
    private Container _deckListContainer;

    private GameGlobal _global;
    private DeckData _currentDeck;
    
    // State
    private string _currentCategory = "LOG";
    private DivisionRosterEntry _pendingEntry;
    private UnitData _pendingUnitData;
    private int _pendingVeterancy;

    private readonly string[] _categories = { "LOG", "INF", "TNK", "REC", "AA", "ART", "HEL", "AIR" };
    private readonly int _maxActivationPoints = 50;
    
    private List<string> _factionIds = new List<string>();
    private List<string> _divisionIds = new List<string>();
    
    private Dictionary<string, List<DivisionData>> _divisionsByFaction = new Dictionary<string, List<DivisionData>>();

    public override void _Ready()
    {
        _global = GameGlobal.Instance;
        
        // Nodes
        _factionSelector = GetNode<OptionButton>("TopPanel/HBox/FactionSelector");
        _divisionSelector = GetNode<OptionButton>("TopPanel/HBox/DivisionSelector");
        _deckNameInput = GetNode<LineEdit>("TopPanel/HBox/DeckNameInput");
        _pointsLabel = GetNode<Label>("TopPanel/HBox/PointsLabel");
        _deckStripContainer = GetNode<HBoxContainer>("TopPanel/HBox/DeckStripScroll/DeckStripContainer");
        _categoryTabs = GetNode<HBoxContainer>("MainArea/LeftPanel/CategoryTabs");
        _libraryGrid = GetNode<Container>("MainArea/LeftPanel/LibraryScroll/LibraryGrid");
        _statsLabel = GetNode<RichTextLabel>("MainArea/RightPanel/VBox/StatsLabel");
        
        _transportPopup = GetNode<Window>("TransportPopup");
        _transportGrid = GetNode<Container>("TransportPopup/TransportScroll/TransportGrid");
        _transportPopup.CloseRequested += () => _transportPopup.Hide();
        
        _loadDeckPopup = GetNode<Window>("LoadDeckPopup");
        _deckListContainer = GetNode<Container>("LoadDeckPopup/Scroll/DeckList");
        _loadDeckPopup.CloseRequested += () => _loadDeckPopup.Hide();

        GetNode<Button>("TopPanel/HBox/BackButton").Pressed += OnBackPressed;
        GetNode<Button>("TopPanel/HBox/LoadButton").Pressed += ShowLoadDeckPopup;
        GetNode<Button>("TopPanel/HBox/SaveButton").Pressed += OnSavePressed;
        
        _factionSelector.ItemSelected += OnFactionSelected;
        _divisionSelector.ItemSelected += OnDivisionSelected;
        
        if (UnitCardScene == null) UnitCardScene = GD.Load<PackedScene>("res://scenes/UI/Components/UnitCardUI.tscn");
        if (DeckFileItemScene == null) DeckFileItemScene = GD.Load<PackedScene>("res://scenes/UI/Components/DeckFileItem.tscn");

        SetupCategoryTabs();
        
        foreach(var div in _global.Divisions.Values)
        {
            if (!_divisionsByFaction.ContainsKey(div.FactionId))
                _divisionsByFaction[div.FactionId] = new List<DivisionData>();
            
            _divisionsByFaction[div.FactionId].Add(div);
        }
        
        PopulateFactions();
    }
    
    private void ShowLoadDeckPopup()
    {
        foreach (Node child in _deckListContainer.GetChildren()) child.QueueFree();
        
        string deckDir = "user://decks";
        if (!DirAccess.DirExistsAbsolute(deckDir)) DirAccess.MakeDirAbsolute(deckDir);
        
        using var dir = DirAccess.Open(deckDir);
        if (dir != null)
        {
            dir.ListDirBegin();
            string fileName = dir.GetNext();
            while (fileName != "")
            {
                if (!dir.CurrentIsDir() && fileName.EndsWith(".json"))
                {
                    var deck = DeckIO.LoadDeck(fileName);
                    if (deck != null)
                    {
                        var item = DeckFileItemScene.Instantiate<DeckFileItem>();
                        _deckListContainer.AddChild(item);
                        
                        string divName = "Unknown Division";
                        string divId = "";
                        
                        if (deck.Division != null && !string.IsNullOrEmpty(deck.Division.Id))
                        {
                            divId = deck.Division.Id;
                            if (_global.Divisions.ContainsKey(divId))
                                divName = _global.Divisions[divId].Name;
                            else
                                divName = deck.Division.Name;
                        }
                        
                        item.Setup(fileName, fileName.Replace(".json", ""), divName, divId);
                        item.DeckSelected += (f) => 
                        {
                            OnLoadFileSelected(f);
                            _loadDeckPopup.Hide();
                        };
                    }
                }
                fileName = dir.GetNext();
            }
        }
        _loadDeckPopup.PopupCentered();
    }

    private void PopulateFactions()
    {
        _factionSelector.Clear();
        _factionIds.Clear();
        
        foreach(var fid in _divisionsByFaction.Keys)
        {
            _factionSelector.AddItem(fid.ToUpper());
            _factionIds.Add(fid);
        }
        
        if (_factionIds.Count > 0)
        {
            _factionSelector.Select(0);
            OnFactionSelected(0);
        }
    }
    
    private void OnFactionSelected(long index)
    {
         if (index < 0 || index >= _factionIds.Count) return;
         string fid = _factionIds[(int)index];
         PopulateDivisions(fid);
    }
    
    private void PopulateDivisions(string factionId)
    {
        _divisionSelector.Clear();
        _divisionIds.Clear();
        
        if (_divisionsByFaction.ContainsKey(factionId))
        {
            foreach (var div in _divisionsByFaction[factionId])
            {
                _divisionSelector.AddItem(div.Name);
                _divisionIds.Add(div.Id);
            }
        }
        
        if (_divisionIds.Count > 0)
        {
            _divisionSelector.Select(0);
            OnDivisionSelected(0);
        }
        else
        {
             _currentDeck = new DeckData(); 
             RefreshLibrary();
        }
    }
    
    private void OnDivisionSelected(long index)
    {
        if (index < 0 || index >= _divisionIds.Count) return;
        string divId = _divisionIds[(int)index];
        if (_global.Divisions.ContainsKey(divId))
        {
             InitializeDeck(_global.Divisions[divId]);
        }
    }

    private void SetupCategoryTabs()
    {
        foreach (var cat in _categories)
        {
            var btn = new Button();
            btn.Text = cat;
            btn.ToggleMode = true;
            btn.ButtonGroup = new ButtonGroup(); 
            btn.Pressed += () => SelectCategory(cat);
            _categoryTabs.AddChild(btn);
        }
    }
    
    private void SelectCategory(string category)
    {
        _currentCategory = category;
        RefreshLibrary();
    }

    private void InitializeDeck(DivisionData division)
    {
        _currentDeck = new DeckData();
        _currentDeck.Division = division;
        _deckNameInput.Text = "New Deck";
        
        SelectCategory("LOG");
        UpdateDeckVisuals();
    }

    private void RefreshLibrary()
    {
        foreach (Node child in _libraryGrid.GetChildren()) child.QueueFree();

        if (_currentDeck.Division == null) return;
        
        foreach (var entry in _currentDeck.Division.Roster)
        {
            if (!_global.UnitLibrary.ContainsKey(entry.UnitId)) continue;
            var unitData = _global.UnitLibrary[entry.UnitId];

            if (unitData.Category == _currentCategory)
            {
                var card = UnitCardScene.Instantiate<UnitCardUI>();
                _libraryGrid.AddChild(card);
                card.Setup(entry, unitData);
                card.CardClicked += (uid, vet) => OnUnitCardClicked(entry, unitData, vet);
            }
        }
    }

    private void OnUnitCardClicked(DivisionRosterEntry entry, UnitData data, int veterancy)
    {
        if (entry.TransportOptions != null && entry.TransportOptions.Count > 0)
        {
            _pendingEntry = entry;
            _pendingUnitData = data;
            _pendingVeterancy = veterancy;
            ShowTransportPopup(entry.TransportOptions);
        }
        else
        {
            AddCardToDeck(entry, data, veterancy, null);
        }
    }

    private void ShowTransportPopup(List<string> options)
    {
        foreach (Node child in _transportGrid.GetChildren()) child.QueueFree();
        
        foreach (var transId in options)
        {
            if (!_global.UnitLibrary.ContainsKey(transId)) continue;
            var transData = _global.UnitLibrary[transId];
            
            var btn = new Button();
            btn.Text = $"{transData.Name} ({transData.Cost})";
            btn.CustomMinimumSize = new Vector2(100, 60);
            btn.Pressed += () => 
            {
                AddCardToDeck(_pendingEntry, _pendingUnitData, _pendingVeterancy, transId);
                _transportPopup.Hide();
            };
            _transportGrid.AddChild(btn);
        }
        
        _transportPopup.PopupCentered();
    }

    private void AddCardToDeck(DivisionRosterEntry entry, UnitData data, int veterancy, string transportId)
    {
        int currentPoints = CalculateActivationPoints();
        int cost = GetNextSlotCost(data.Category);
        
        if (cost == -1) 
        {
            GD.Print("No more slots for this category!");
            return;
        }
        
        if (currentPoints + cost > _maxActivationPoints)
        {
            GD.Print("Not enough Activation Points!");
            return;
        }

        var card = new UnitCard();
        card.UnitId = entry.UnitId;
        card.Data = data;
        card.Veterancy = veterancy;
        card.TransportId = transportId;
        
        string[] vetKeys = ["rookie", "trained", "veteran", "elite"];
        string vetKey = (veterancy >=0 && veterancy < 4) ? vetKeys[veterancy] : "trained";
        
        if (entry.Availability.ContainsKey(vetKey))
            card.MaxCount = entry.Availability[vetKey];
        else
            card.MaxCount = 0; 
            
        card.AvailableCount = card.MaxCount;

        if (transportId != null)
        {
             if (_global.UnitLibrary.ContainsKey(transportId))
                 card.Cost = data.Cost + _global.UnitLibrary[transportId].Cost;
             else 
                 card.Cost = data.Cost;
        }
        else
        {
            card.Cost = data.Cost;
        }

        _currentDeck.Cards.Add(card);
        UpdateDeckVisuals();
    }
    
    private void RemoveCard(UnitCard card)
    {
        _currentDeck.Cards.Remove(card);
        UpdateDeckVisuals();
    }

    private void UpdateDeckVisuals()
    {
        foreach (Node child in _deckStripContainer.GetChildren()) child.QueueFree();
        
        foreach (var card in _currentDeck.Cards)
        {
            var item = DeckStripItemScene.Instantiate<DeckStripItem>();
            _deckStripContainer.AddChild(item);
            string name = card.Data.Name;
            item.Setup(name, card.Veterancy, card.Cost.ToString());
            item.DecorationClicked += () => RemoveCard(card);
        }
        
        int points = CalculateActivationPoints();
        _pointsLabel.Text = $"{points}/{_maxActivationPoints}";
    }

    private int CalculateActivationPoints()
    {
        if (_currentDeck.Division == null) return 0;
        
        int total = 0;
        var categoryCounts = new Dictionary<string, int>();
        
        foreach(var c in _categories) categoryCounts[c] = 0;
        
        foreach (var card in _currentDeck.Cards)
        {
            string cat = card.Data.Category;
            if (string.IsNullOrEmpty(cat)) continue;
            
            if (_currentDeck.Division.SlotCosts.ContainsKey(cat))
            {
                int[] costs = _currentDeck.Division.SlotCosts[cat];
                int index = categoryCounts[cat];
                if (index < costs.Length)
                {
                    total += costs[index];
                }
                categoryCounts[cat]++;
            }
        }
        return total;
    }

    private int GetNextSlotCost(string category)
    {
        if (_currentDeck.Division == null) return -1;
        var counts = _currentDeck.Cards.Count(c => c.Data.Category == category);
        
        if (_currentDeck.Division.SlotCosts.ContainsKey(category))
        {
            int[] costs = _currentDeck.Division.SlotCosts[category];
            if (counts < costs.Length) return costs[counts];
        }
        return -1; 
    }

    private void OnLoadFileSelected(string path)
    {
        var deck = DeckIO.LoadDeck(path);
        if (deck != null)
        {
            _global.HydrateDeck(deck);
            _currentDeck = deck;
            
            if (_currentDeck.Division != null)
            {
                string facId = _currentDeck.Division.FactionId;
                
                for(int i=0; i<_factionIds.Count; i++)
                {
                    if (_factionIds[i] == facId)
                    {
                        _factionSelector.Select(i);
                        OnFactionSelected(i); 
                        break;
                    }
                }
                
                string divId = _currentDeck.Division.Id;
                for(int i=0; i<_divisionIds.Count; i++)
                {
                    if (_divisionIds[i] == divId)
                    {
                        _divisionSelector.Select(i);
                        break;
                    }
                }
            }
            
            _deckNameInput.Text = path.GetFile().GetBaseName();
            UpdateDeckVisuals();
            RefreshLibrary();
            
            GD.Print($"DeckBuilder: Loaded {deck.Cards.Count} cards.");
        }
    }

    private void OnSavePressed()
    {
        string name = _deckNameInput.Text;
        if (string.IsNullOrWhiteSpace(name)) name = "Unnamed Deck";
        DeckIO.SaveDeck(_currentDeck, name);
    }
    
    private void OnBackPressed()
    {
        GameGlobal.Instance.ChangeScene("res://scenes/UI/MainMenu.tscn");
    }
}
