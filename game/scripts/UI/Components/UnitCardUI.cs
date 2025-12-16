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
    private HBoxContainer _veterancyContainer;
    
    public string UnitId { get; private set; }
    public int SelectedVeterancy { get; private set; } = 0; // 0=Rookie

    private DivisionRosterEntry _entry;

    public override void _Ready()
    {
        _nameLabel = GetNode<Label>("VBoxContainer/NameLabel");
        _costLabel = GetNode<Label>("VBoxContainer/TopBar/CostLabel");
        _iconRect = GetNode<TextureRect>("VBoxContainer/IconRect");
        _countLabel = GetNode<Label>("VBoxContainer/BottomBar/CountLabel");
        _veterancyContainer = GetNode<HBoxContainer>("VBoxContainer/VeterancyContainer");

        GuiInput += OnGuiInput;
    }

    public void Setup(DivisionRosterEntry entry, UnitData data)
    {
        _entry = entry;
        UnitId = entry.UnitId;
        
        _nameLabel.Text = data.Name;
        _costLabel.Text = data.Cost.ToString();
        // Load icon if available, else placeholder
        // Load icon logic
        string iconPath = data.Icon;
        if (!string.IsNullOrEmpty(iconPath))
        {
            if (!iconPath.StartsWith("res://")) iconPath = "res://" + iconPath;
            
            // Handle mismatched extension (JSON says png but might be jpg)
            if (!ResourceLoader.Exists(iconPath))
            {
                string basePath = iconPath.GetBaseName(); // Strips extension
                string[] exts = { ".jpg", ".jpeg", ".png" };
                foreach(var ext in exts)
                {
                    if (ResourceLoader.Exists(basePath + ext))
                    {
                        iconPath = basePath + ext;
                        break;
                    }
                }
            }
            
            if (ResourceLoader.Exists(iconPath))
            {
                _iconRect.Texture = GD.Load<Texture2D>(iconPath);
            }
        }
        
        SetupVeterancyButtons();
        UpdateAvailabilityDisplay();
    }

    private void SetupVeterancyButtons()
    {
        // Clear existing
        foreach(Node child in _veterancyContainer.GetChildren()) child.QueueFree();

        // Check availability keys in entry
        // "rookie" (0), "trained" (1), "veteran" (2), "elite" (3)
        // Or generic 0,1,2,3
        
        // Actually DivisionData uses strings "trained", etc.
        string[] vetKeys = ["rookie", "trained", "veteran", "elite"];
        
        for(int i=0; i<4; i++)
        {
            string key = vetKeys[i];
            if (!_entry.Availability.ContainsKey(key)) continue;

            var btn = new Button();
            btn.Text = new string('^', i); // Cheap chevron representation
            if (i==0) btn.Text = "-"; // Rookie
            
            btn.CustomMinimumSize = new Vector2(20, 20);
            btn.ToggleMode = true;
            btn.ButtonGroup = new ButtonGroup(); // Wait, specific group? No, local logic.
            
            // Interaction
            int vetLevel = i;
            btn.Pressed += () => SelectVeterancy(vetLevel);
            
            _veterancyContainer.AddChild(btn);
            
            // Auto select lowest available if nothing selected
             if (SelectedVeterancy == -1) // or logic to default
             {
                 btn.SetPressedNoSignal(true);
                 SelectedVeterancy = i;
             }
        }
    }

    private void SelectVeterancy(int level)
    {
        SelectedVeterancy = level;
        UpdateAvailabilityDisplay();
        EmitSignal(SignalName.VeterancyChanged, UnitId, SelectedVeterancy);
    }

    private void OnGuiInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left)
        {
            EmitSignal(SignalName.CardClicked, UnitId, SelectedVeterancy);
        }
    }

    private void UpdateAvailabilityDisplay()
    {
        // Get count for current veterancy
        string[] vetKeys = ["rookie", "trained", "veteran", "elite"];
        if (SelectedVeterancy >= 0 && SelectedVeterancy < 4)
        {
            string key = vetKeys[SelectedVeterancy];
            if (_entry.Availability.ContainsKey(key))
            {
                int count = _entry.Availability[key];
                _countLabel.Text = $"{count}/{count}"; // TODO: Track remaining available
            }
        }
    }
}
