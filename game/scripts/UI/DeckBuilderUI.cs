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
    
    // Split Stats
    private Control _pinnedPanel;
    private Control _currentPanel;
    private RichTextLabel _pinnedStats;
    private RichTextLabel _currentStats;
    
    private Button _pinButton;
    private bool _isPinned = false;
    private UnitData? _pinnedUnit = null;
    
    private Window _transportPopup;
    private Container _transportGrid;
    
    private Window _loadDeckPopup;
    private Container _deckListContainer;

    private GameGlobal _global;
    private DeckData _currentDeck;
    
    // State
    private string _currentCategory = "LOG";

    private readonly string[] _categories = { "LOG", "INF", "TNK", "REC", "AA", "ART", "HEL", "AIR" };
    private readonly int _maxActivationPoints = 50;
    
    private List<string> _factionIds = new List<string>();
    private List<string> _divisionIds = new List<string>();
    
    private Dictionary<string, List<DivisionData>> _divisionsByFaction = new Dictionary<string, List<DivisionData>>();
    private Dictionary<string, Button> _categoryButtons = new Dictionary<string, Button>();

    private Control _leftPanel;
    private Control _rightPanel;

    public override void _Ready()
    {
        _global = GameGlobal.Instance;
        
        // Nodes
        // Nodes
        _factionSelector = GetNode<OptionButton>("DeckSection/VBox/TopBar/FactionSelector");
        _divisionSelector = GetNode<OptionButton>("DeckSection/VBox/TopBar/DivisionSelector");
        _deckNameInput = GetNode<LineEdit>("DeckSection/VBox/TopBar/DeckNameInput");
        _pointsLabel = GetNode<Label>("DeckSection/VBox/TopBar/PointsLabel");
        
        // Deck Strip is in the top section now
        _deckStripContainer = GetNode<HBoxContainer>("DeckSection/VBox/DeckStripScroll/DeckStripContainer");
        
        // Library is in the bottom section
        _leftPanel = GetNode<Control>("LibrarySection/LeftPanel");
        _rightPanel = GetNode<Control>("LibrarySection/RightPanel");
        
        _categoryTabs = GetNode<HBoxContainer>("LibrarySection/LeftPanel/CategoryTabs");
        _libraryGrid = GetNode<Container>("LibrarySection/LeftPanel/LibraryScroll/LibraryGrid");
        
        // Stats Containers
        _pinnedPanel = GetNode<Control>("LibrarySection/RightPanel/VBox/StatsContainer/PinnedPanel");
        _currentPanel = GetNode<Control>("LibrarySection/RightPanel/VBox/StatsContainer/CurrentPanel");
        _pinnedStats = GetNode<RichTextLabel>("LibrarySection/RightPanel/VBox/StatsContainer/PinnedPanel/PinnedStats");
        _currentStats = GetNode<RichTextLabel>("LibrarySection/RightPanel/VBox/StatsContainer/CurrentPanel/CurrentStats");
        
        _pinnedStats.BbcodeEnabled = true;
        _currentStats.BbcodeEnabled = true;
        
        SetupPinButton(); // Init pin button
        
        _transportPopup = GetNode<Window>("TransportPopup");
        _transportGrid = GetNode<Container>("TransportPopup/TransportScroll/TransportGrid");
        _transportPopup.CloseRequested += () => _transportPopup.Hide();
        _loadDeckPopup = GetNode<Window>("LoadDeckPopup");
        _deckListContainer = GetNode<Container>("LoadDeckPopup/Scroll/DeckList");
        _loadDeckPopup.CloseRequested += () => _loadDeckPopup.Hide();

        GetNode<Button>("DeckSection/VBox/TopBar/BackButton").Pressed += OnBackPressed;
        GetNode<Button>("DeckSection/VBox/TopBar/LoadButton").Pressed += ShowLoadDeckPopup;
        GetNode<Button>("DeckSection/VBox/TopBar/SaveButton").Pressed += OnSavePressed;
        
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

    private void SetupPinButton()
    {
        var infoLabel = GetNode<Label>("LibrarySection/RightPanel/VBox/InfoLabel");
        var parent = infoLabel.GetParent();
        
        var hbox = new HBoxContainer();
        hbox.Alignment = BoxContainer.AlignmentMode.Center;
        
        parent.AddChild(hbox);
        parent.MoveChild(hbox, infoLabel.GetIndex());
        
        infoLabel.Reparent(hbox);
        
        _pinButton = new Button();
        _pinButton.ToggleMode = true;
        _pinButton.CustomMinimumSize = new Vector2(32, 32);
        
        var pinIcon = GD.Load<Texture2D>("res://assets/icons/ui/pin.svg");
        _pinButton.Icon = pinIcon;
        _pinButton.ExpandIcon = true;
        
        _pinButton.Pressed += OnPinToggled;
        
        hbox.AddChild(_pinButton);
    }
    
    private void OnPinToggled()
    {
        _isPinned = _pinButton.ButtonPressed;
        if (!_isPinned)
        {
            _pinnedUnit = null;
            // Restore original proportions (Left 3 : Right 1)
            _leftPanel.SizeFlagsStretchRatio = 3.0f;
            _rightPanel.SizeFlagsStretchRatio = 1.0f;
            ClearStats();
        }
        else
        {
             // Expand Right Panel (Left 1 : Right 1 = 50% split)
             _leftPanel.SizeFlagsStretchRatio = 1.0f;
             _rightPanel.SizeFlagsStretchRatio = 1.0f;
        }
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
        _categoryButtons.Clear();
        var group = new ButtonGroup();
        foreach (var cat in _categories)
        {
            var btn = new Button();
            btn.Text = cat;
            btn.ToggleMode = true;
            btn.ButtonGroup = group;
            btn.Pressed += () => SelectCategory(cat);
            _categoryTabs.AddChild(btn);
            _categoryButtons[cat] = btn;
        }
    }
    
    private void UpdateCategoryTabLabels()
    {
        if (_currentDeck.Division == null) return;
        
        foreach(var kvp in _categoryButtons)
        {
            string cat = kvp.Key;
            Button btn = kvp.Value;
            
            int nextCost = GetNextSlotCost(cat);
            if (nextCost == -1)
            {
                btn.Text = $"{cat} (MAX)";
                // Optional: Disable button if full? 
                // btn.Disabled = true; 
            }
            else
            {
                btn.Text = $"{cat} ({nextCost})";
                // btn.Disabled = false;
            }
        }
    }
    
    private void SelectCategory(string category)
    {
        _currentCategory = category;
        RefreshLibrary();
        UpdateDeckVisuals(); // Update visuals to filter deck strip
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
                
                int countInDeck = _currentDeck.Cards.Count(c => c.UnitId == entry.UnitId);
                card.Setup(entry, unitData, countInDeck);
                
                card.CardClicked += (uid, vet) => OnUnitCardClicked(entry, unitData, vet);
                card.MouseEntered += () => DisplayUnitStats(unitData);
                card.MouseExited += ClearStats;
            }
        }
    }

    private void DisplayUnitStats(UnitData unit)
    {
        if (_isPinned)
        {
            if (_pinnedUnit == null) _pinnedUnit = unit;
            
            _pinnedPanel.Visible = true;
            _currentPanel.Visible = true;
            
            // Pinned Side
            if (_pinnedUnit.HasValue)
            {
                _pinnedStats.Text = "[center][b][color=#FFD700]PINNED[/color][/b][/center]\n" + GenerateUnitStatsText(_pinnedUnit.Value);
            }
            
            // Current Side
            if (_pinnedUnit.HasValue && _pinnedUnit.Value.Id == unit.Id)
            {
                // Hovering the pinned unit - show "Same" or just duplicate? 
                // Let's show duplicate for consistency or "Hovering Pinned"
                _currentStats.Text = "[center][b][color=#00FF00]CURRENT[/color][/b][/center]\n" + GenerateUnitStatsText(unit);
            }
            else
            {
                _currentStats.Text = "[center][b][color=#00FF00]CURRENT[/color][/b][/center]\n" + GenerateUnitStatsText(unit);
            }
        }
        else
        {
            // Normal Mode
            _pinnedPanel.Visible = false;
            _currentPanel.Visible = true;
            _currentStats.Text = GenerateUnitStatsText(unit);
            
            // If we decide to pin now, this is the unit we pin
            if (_pinButton.ButtonPressed) _pinnedUnit = unit; 
        }
    }
    
    private void ClearStats()
    {
        if (!_isPinned)
        {
            _pinnedPanel.Visible = false;
            _currentPanel.Visible = true;
            _currentStats.Text = "Hover over a unit...";
        }
        else if (_pinnedUnit != null)
        {
            // Revert to showing just the pinned unit? Or keep pinned visible and clear right?
            // "when mousing over another unit it will show the new unit ... side by side"
            // So if NOT hovering, maybe hide right side?
            _pinnedPanel.Visible = true;
            _currentPanel.Visible = false; 
            _pinnedStats.Text = "[center][b][color=#FFD700]PINNED[/color][/b][/center]\n" + GenerateUnitStatsText(_pinnedUnit.Value);
        }
    }

    private string GenerateUnitStatsText(UnitData unit)
    {
        string text = $"[b]{unit.Name.ToUpper()}[/b]\n";
        text += $"Cost: {unit.Cost}\nHP: {unit.Health}\nOptics: {unit.Optics}\nStealth: {unit.Stealth}\n";
        
        if (unit.Speed.Road > 0)
            text += $"Speed: {unit.Speed.Road}/{unit.Speed.OffRoad}\n";
            
        if (unit.Armor.Front > 0 || unit.Armor.Side > 0 || unit.Armor.Rear > 0 || unit.Armor.Top > 0)
            text += $"Armor: {unit.Armor.Front}/{unit.Armor.Side}/{unit.Armor.Rear}/{unit.Armor.Top}\n";

        text += "\n[b]WEAPONS:[/b]\n";
        if (unit.Weapons != null)
        {
            foreach(var w in unit.Weapons)
            {
                 string faction = "vanguard";
                 if (w.WeaponId.ToLower().StartsWith("sdf")) faction = "sdf";
                 string iconPath = $"res://assets/icons/weapons/{faction}/{w.WeaponId}.svg";
                 
                 if (ResourceLoader.Exists(iconPath))
                 {
                     text += $"[img=24]{iconPath}[/img] {w.WeaponId} (x{w.Count}) [{w.MaxAmmo}]\n";
                 }
                 else
                 {
                     text += $"[NO ICON] {w.WeaponId} (x{w.Count}) [{w.MaxAmmo}]\n";
                 }
            }
        }
        return text;
    }

    private void OnUnitCardClicked(DivisionRosterEntry entry, UnitData data, int veterancy)
    {
        if (entry.TransportOptions != null && entry.TransportOptions.Count > 0)
        {
            ShowTransportPopup(entry.TransportOptions, (tid) => 
            {
                AddCardToDeck(entry, data, veterancy, tid);
            });
        }
        else
        {
            AddCardToDeck(entry, data, veterancy, null);
        }
    }

    private void ShowTransportPopup(List<string> options, Action<string> onTransportSelected)
    {
        foreach (Node child in _transportGrid.GetChildren()) child.QueueFree();
        
        foreach (var transId in options)
        {
            if (!_global.UnitLibrary.ContainsKey(transId)) continue;
            var transData = _global.UnitLibrary[transId];
            
            // Use UnitCardUI instead of simple buttons
            var card = UnitCardScene.Instantiate<UnitCardUI>();
            _transportGrid.AddChild(card);
            
            card.Setup(transData);
            
            // Handle Click
            card.GuiInput += (ev) => 
            {
                if (ev is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left)
                {
                    onTransportSelected?.Invoke(transId);
                    _transportPopup.Hide();
                }
            };
            
            // Handle Hover
            card.MouseEntered += () => DisplayUnitStats(transData);
            card.MouseExited += ClearStats;
        }
        
        _transportPopup.PopupCentered();
    }
    
    public override void _Input(InputEvent @event)
    {
        // Detect click outside when popup is visible
        if (_transportPopup.Visible && @event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left)
        {
            // If the click is not inside the transport popup rect...
            // Note: Window events are tricky. If this is the main viewport input, 
            // and the Window is a child Window, clicking outside it (on main UI) triggers this.
            // Clicking inside the Window usually is consumed by the Window's viewport.
            // So if we receive a click here while it's open, it's likely outside.
            _transportPopup.Hide();
        }
    }

    private void AddCardToDeck(DivisionRosterEntry entry, UnitData data, int veterancy, string transportId)
    {
        int currentPoints = CalculateActivationPoints();
        int cost = GetNextSlotCost(data.Category);
        
        if (cost == -1) 
        {
            GD.PrintErr($"No more slots for this category: {data.Category}. Check Division JSON 'slot_costs' for this category key.");
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
        UpdateDeckVisuals(); // Full refresh to handle slot shifts
    }

    private void UpdateDeckVisuals()
    {
        foreach (Node child in _deckStripContainer.GetChildren()) child.QueueFree();
        
        // Filter by current category
        var filteredCards = _currentDeck.Cards.Where(c => c.Data.Category == _currentCategory).ToList();
        
        if (_currentDeck.Division != null && _currentDeck.Division.SlotCosts.ContainsKey(_currentCategory))
        {
            int[] costs = _currentDeck.Division.SlotCosts[_currentCategory];
            
            for (int i = 0; i < costs.Length; i++)
            {
                var item = DeckStripItemScene.Instantiate<DeckStripItem>();
                _deckStripContainer.AddChild(item);
                
                if (i < filteredCards.Count)
                {
                    // Filled Slot
                    var card = filteredCards[i];
                    
                    // Find roster entry for this card to pass to SetupFilled
                    var entry = _currentDeck.Division.Roster.FirstOrDefault(e => e.UnitId == card.UnitId);
                    
                    if (entry != null)
                    {
                        item.SetupFilled(card, entry);
                        
                        // Handle interactions
                        item.VeterancyChanged += (level) => 
                        {
                            card.Veterancy = level;
                            // Recalculate max/avail
                            string[] vetKeys = ["rookie", "trained", "veteran", "elite"];
                            string vetKey = (level >=0 && level < 4) ? vetKeys[level] : "trained";
                            
                            // Re-check max count based on new veterancy
                            if (entry.Availability.ContainsKey(vetKey))
                                card.MaxCount = entry.Availability[vetKey];
                            else
                                card.MaxCount = 0; // Should handle this appropriately
                            
                            // Reset available count to max (or handle used count logic if that exists later)
                            card.AvailableCount = card.MaxCount; 
                            
                            UpdateDeckVisuals(); // Visual refresh
                        };
                        
                        item.TransportClicked += () => 
                        {
                            if (entry.TransportOptions != null && entry.TransportOptions.Count > 0)
                            {
                                ShowTransportPopup(entry.TransportOptions, (tid) => 
                                {
                                    card.TransportId = tid;
                                    
                                    // Recalculate cost
                                    if (tid != null && _global.UnitLibrary.ContainsKey(tid))
                                         card.Cost = card.Data.Cost + _global.UnitLibrary[tid].Cost;
                                     else 
                                         card.Cost = card.Data.Cost;
                                         
                                    UpdateDeckVisuals();
                                });
                            }
                        };

                        // Hover logic for transport in deck strip
                        if (entry.TransportOptions != null && !string.IsNullOrEmpty(card.TransportId))
                        {
                            // Capture current transport ID for the closure
                            string tid = card.TransportId;
                            if (tid != null && _global.UnitLibrary.ContainsKey(tid))
                            {
                                var tData = _global.UnitLibrary[tid];
                                item.TransportHovered += () => DisplayUnitStats(tData);
                                item.TransportExited += ClearStats;
                            }
                        }
                    }
                    else
                    {
                         GD.PrintErr($"Could not find roster entry for unit {card.UnitId} in current division.");
                    }

                    item.DecorationClicked += () => RemoveCard(card);
                }
                else if (i == filteredCards.Count)
                {
                    // Next Slot
                    item.SetupEmpty(costs[i], true);
                }
                else
                {
                    // Future Slot
                    item.SetupEmpty(costs[i], false);
                }
            }
        }
        
        int points = CalculateActivationPoints();
        _pointsLabel.Text = $"{points}/{_maxActivationPoints}";
        
        UpdateCategoryTabLabels();
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
