using Godot;
using System;

public partial class HotkeysModal : PanelContainer
{
    private Button _closeButton;

    public override void _Ready()
    {
        _closeButton = GetNode<Button>("VBoxContainer/CloseButton");
        _closeButton.Pressed += OnClosePressed;
        
        Visible = false;
    }

    public void Popup()
    {
        Visible = true;
        MoveToFront();
    }

    private void OnClosePressed()
    {
        Visible = false;
    }
}
