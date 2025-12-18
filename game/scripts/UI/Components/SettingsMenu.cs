using Godot;
using System;

public partial class SettingsMenu : Control
{
    private TextureButton _settingsButton;
    private Control _menuPanel;
    private Button _hotkeysButton;
    private Button _quitButton;
    private HotkeysModal _hotkeysModal;

    public override void _Ready()
    {
        _settingsButton = GetNode<TextureButton>("SettingsButton");
        _menuPanel = GetNode<Control>("MenuPanel");
        _hotkeysButton = GetNode<Button>("MenuPanel/VBoxContainer/HotkeysButton");
        _quitButton = GetNode<Button>("MenuPanel/VBoxContainer/QuitButton");

        _settingsButton.Pressed += OnSettingsButtonPressed;
        _hotkeysButton.Pressed += OnHotkeysButtonPressed;
        _quitButton.Pressed += OnQuitButtonPressed;

        _menuPanel.Visible = false;
        
        // Load HotkeysModal dynamically usually, or if it is a child.
        // For this implementation, let's assume it's created dynamically or added as child.
        // Plan says "Child: HotkeysModal (Instance of HotkeysModal.tscn)".
        // But I haven't added it to the .tscn yet because I haven't created it yet.
        // I'll add logic to instantiate it if missing or just add it to tscn later.
    }

    private void OnSettingsButtonPressed()
    {
        _menuPanel.Visible = !_menuPanel.Visible;
    }

    private void OnHotkeysButtonPressed()
    {
        _menuPanel.Visible = false;
        
        // Find or create modal
        if (_hotkeysModal == null)
        {
            var scene = GD.Load<PackedScene>("res://scenes/UI/Components/HotkeysModal.tscn");
            _hotkeysModal = scene.Instantiate<HotkeysModal>();
            AddChild(_hotkeysModal); // Add as child of this control
            
            // Re-center logic might be needed if this control is in top right.
            // HotkeysModal should probably use AnchorsCenter.
        }
        
        _hotkeysModal.Popup();
    }

    private void OnQuitButtonPressed()
    {
        // For now, exit application
        GetTree().Quit();
    }
}
