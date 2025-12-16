using Godot;

public partial class DeckStripItem : PanelContainer
{
    [Signal]
    public delegate void DecorationClickedEventHandler();

    private Label _nameLabel;
    private TextureRect _iconRect;
    private Label _vetLabel;

    public override void _Ready()
    {
        _nameLabel = GetNode<Label>("VBoxContainer/NameLabel");
        _vetLabel = GetNode<Label>("VBoxContainer/VetLabel");
        
        GuiInput += OnGuiInput;
    }

    public void Setup(string name, int veterancy, string cost)
    {
        _nameLabel.Text = name;
        _vetLabel.Text = new string('^', veterancy);
        TooltipText = "Left Click to Remove";
    }

    private void OnGuiInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left)
        {
            EmitSignal(SignalName.DecorationClicked);
        }
    }
}
