using Godot;

public partial class DeckFileItem : Button
{
    [Signal]
    public delegate void DeckSelectedEventHandler(string fileName);

    private string _fileName;
    private TextureRect _iconRect;
    private Label _deckNameLabel;
    private Label _divNameLabel;

    public override void _Ready()
    {
        _iconRect = GetNode<TextureRect>("HBox/IconRect");
        _deckNameLabel = GetNode<Label>("HBox/VBox/DeckNameLabel");
        _divNameLabel = GetNode<Label>("HBox/VBox/DivNameLabel");
        
        Pressed += OnPressed;
    }

    public void Setup(string fileName, string deckName, string divisionName, string divisionId)
    {
        _fileName = fileName;
        _deckNameLabel.Text = deckName;
        _divNameLabel.Text = divisionName;
        
        // Try to load icon
        string[] extensions = { ".png", ".jpg", ".jpeg" };
        Texture2D icon = null;
        
        foreach (var ext in extensions)
        {
            string iconPath = $"res://assets/icons/divisions/{divisionId}{ext}";
            if (ResourceLoader.Exists(iconPath))
            {
                icon = GD.Load<Texture2D>(iconPath);
                break;
            }
        }
        
        if (icon != null)
        {
            _iconRect.Texture = icon;
        }
        else
        {
            // Placeholder color or something?
            // Existing placeholder logic defaults to null/white.
        }
    }

    private void OnPressed()
    {
        EmitSignal(SignalName.DeckSelected, _fileName);
    }
}
