using Godot;

public partial class ReinforcePoint : Node3D
{
    [Export(PropertyHint.Enum, "Player,Enemy")]
    public string Team { get; set; } = "Player";

    public override void _Ready()
    {
        // Add to group for easy finding
        AddToGroup("ReinforcePoints");
    }


}
