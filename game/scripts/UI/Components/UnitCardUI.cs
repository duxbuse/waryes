using Godot;
using System;
using WarYes.Data;

public partial class UnitCardUI : PanelContainer
{
    [Signal]
    public delegate void CardClickedEventHandler(string unitId, int veterancy);
    
    [Signal]
    public delegate void VeterancyChangedEventHandler(string unitId, int veterancy);

    private Label _nameLabel;
    private Label _costLabel;
    private TextureRect _iconRect;
    private Label _countLabel;
    private VBoxContainer _veterancyContainer;
    private Label _commanderIcon;
    private Label _maxCardsLabel;
    private ButtonGroup _vetGroup;

    public string UnitId { get; private set; }
    public int SelectedVeterancy { get; private set; } = 0; 

    private DivisionRosterEntry _entry;

    public override void _Ready()
    {
        _nameLabel = GetNode<Label>("Content/BottomPanel/HBox/NameLabel");
        _costLabel = GetNode<Label>("Content/CostLabel");
        _iconRect = GetNode<TextureRect>("Content/IconRect");
        _countLabel = GetNode<Label>("Content/CountLabel");
        
        // Ensure this container has alignment logic if needed, but the panel handles position
        _veterancyContainer = GetNode<VBoxContainer>("Content/VeterancyPanel/VeterancyContainer"); 
        
        _commanderIcon = GetNode<Label>("Content/BottomPanel/HBox/CommanderIcon");
        _maxCardsLabel = GetNode<Label>("Content/BottomPanel/HBox/MaxCardsLabel");

        _vetGroup = new ButtonGroup();

        GuiInput += OnGuiInput;
    }

    public void Setup(DivisionRosterEntry entry, UnitData data, int countInDeck)
    {
        _entry = entry;
        UnitId = data.Id;
        
        _nameLabel.Text = data.Name.ToUpper();
        _costLabel.Text = data.Cost.ToString();
        _iconRect.Texture = WarYes.Utils.IconLoader.LoadUnitIcon(data);
        
        if (entry != null)
        {
            int max = entry.MaxCards;
            int remaining = max - countInDeck;
            
            if (remaining > 1)
            {
                 _maxCardsLabel.Text = $"[{remaining}]";
                 _maxCardsLabel.Visible = true;
            }
            else
            {
                 _maxCardsLabel.Visible = false;
            }
            
            if (remaining <= 0)
            {
                Modulate = new Color(0.5f, 0.5f, 0.5f, 0.5f);
                MouseFilter = MouseFilterEnum.Ignore;
            }
            else
            {
                Modulate = Colors.White;
                MouseFilter = MouseFilterEnum.Stop; 
            }
            
            SetupVeterancyButtons(entry);
            UpdateAvailabilityDisplay();
        }
        else
        {
            // Transport / Display only mode
            _maxCardsLabel.Visible = false;
            _countLabel.Visible = false;
            _veterancyContainer.Visible = false;
            Modulate = Colors.White;
            MouseFilter = MouseFilterEnum.Stop;
        }

        if (data.IsCommander)
        {
            _commanderIcon.Visible = true;
            _nameLabel.Modulate = new Color(1, 0.8f, 0); 
        }
        else
        {
            _commanderIcon.Visible = false;
            _nameLabel.Modulate = Colors.White;
        }
    }
    
    public void Setup(UnitData data)
    {
        Setup(null, data, 0);
    }

    private void SetupVeterancyButtons(DivisionRosterEntry entry)
    {
        foreach(Node child in _veterancyContainer.GetChildren()) child.QueueFree();

        string[] vetKeys = ["rookie", "trained", "veteran", "elite"];


        // Render Top to Bottom (High to Low or Low to High?)
        // User image shows 3 slots. Wargame allows picking any of the 4/5 levels. 
        // Standard UI is usually Low -> High or High -> Low.
        // Let's stick to High to Low (3 down to 0) as typical for deck builders (Elite on top).
        
        for(int i=3; i>=0; i--) 
        {
            string key = vetKeys[i];
            bool isAvailable = entry.Availability.ContainsKey(key) && entry.Availability[key] > 0;

            var btn = new Button();
            btn.ToggleMode = true;
            btn.ButtonGroup = _vetGroup;
            btn.CustomMinimumSize = new Vector2(30, 26);
            btn.ThemeTypeVariation = "FlatButton"; 
            
            // Visuals using TextureRect
            var icon = new TextureRect();
            icon.ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize;
            icon.StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered;
            icon.LayoutMode = 1; 
            icon.AnchorsPreset = (int)Control.LayoutPreset.FullRect;
            icon.Texture = WarYes.Utils.IconLoader.LoadVeterancyIcon(i);
            
            btn.AddChild(icon);

            if (!isAvailable)
            {
                // "Fully black out the section"
                btn.Disabled = true;
                btn.Modulate = Colors.Black; 
                icon.Visible = false; 
            }
            else
            {
                // Interaction
                int level = i;
                btn.Pressed += () => SelectVeterancy(level);
            }

            _veterancyContainer.AddChild(btn);
        }
        
        // Auto select LOWEST available
        // Iterate 0 to 3
        for(int i=0; i<4; i++)
        {
             string key = vetKeys[i];
             // MUST check count > 0, not just ContainsKey
             if (entry.Availability.ContainsKey(key) && entry.Availability[key] > 0)
             {
                 SelectVeterancy(i);
                 break;
             }
        }
    }

    private void SelectVeterancy(int level)
    {
        // Update button pressed state manually? 
        // Iterate children, check index.
        // We created buttons 3, 2, 1, 0.
        // So level 0 is child index 3. Level 3 is child index 0.
        int childIndex = 3 - level;
        if (childIndex >= 0 && childIndex < _veterancyContainer.GetChildCount())
        {
             var btn = _veterancyContainer.GetChild<Button>(childIndex);
             if (!btn.Disabled) 
             {
                 btn.SetPressedNoSignal(true);
                 SelectedVeterancy = level;
                 UpdateAvailabilityDisplay();
                 EmitSignal(SignalName.VeterancyChanged, UnitId, SelectedVeterancy);
             }
        }
    }
    
    private void UpdateAvailabilityDisplay()
    {
        string[] vetKeys = ["rookie", "trained", "veteran", "elite"];
        if (SelectedVeterancy >= 0 && SelectedVeterancy < 4)
        {
            string key = vetKeys[SelectedVeterancy];
            if (_entry.Availability.ContainsKey(key))
            {
                int count = _entry.Availability[key];
                 // Show "xCount"
                _countLabel.Text = $"x{count}"; 
            }
        }
    }

    private void OnGuiInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left)
        {
            EmitSignal(SignalName.CardClicked, UnitId, SelectedVeterancy);
        }
    }
}
