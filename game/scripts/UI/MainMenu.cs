using Godot;

public partial class MainMenu : Control
{
    private Button _skirmishButton;
    private Button _deckBuilderButton;
    private Button _quitButton;

    public override void _Ready()
    {
        _skirmishButton = GetNode<Button>("VBoxContainer/SkirmishButton");
        _deckBuilderButton = GetNode<Button>("VBoxContainer/DeckBuilderButton");
        _quitButton = GetNode<Button>("VBoxContainer/QuitButton");

        _skirmishButton.Pressed += OnSkirmishPressed;
        _deckBuilderButton.Pressed += OnDeckBuilderPressed;
        _quitButton.Pressed += OnQuitPressed;
    }

    private void OnSkirmishPressed()
    {
        GameGlobal.Instance.ChangeScene("res://scenes/UI/SkirmishSetup.tscn");
    }

    private void OnDeckBuilderPressed()
    {
        GameGlobal.Instance.ChangeScene("res://scenes/UI/DeckBuilder.tscn");
    }

    private void OnQuitPressed()
    {
        GetTree().Quit();
    }
}
