using Godot;
using System.Collections.Generic;

public partial class ObjectiveManager : Node
{
    public static ObjectiveManager Instance { get; private set; }

    [Signal]
    public delegate void ScoreUpdatedEventHandler(int blueScore, int redScore);

    [Signal]
    public delegate void MatchEndedEventHandler(string winner);

    [Export]
    public int VictoryThreshold { get; set; } = 2000;

    [Export]
    public float TickInterval { get; set; } = 1.0f;

    public int BlueScore { get; private set; }
    public int RedScore { get; private set; }

    private Timer _tickTimer;
    private List<CaptureZone> _zones = new List<CaptureZone>();

    public override void _Ready()
    {
        Instance = this;
        
        _tickTimer = new Timer();
        _tickTimer.WaitTime = TickInterval;
        _tickTimer.Timeout += OnTick;
        AddChild(_tickTimer);
    }

    public void RegisterZone(CaptureZone zone)
    {
        if (!_zones.Contains(zone))
        {
            _zones.Add(zone);
        }
    }

    public void StartMatch()
    {
        _tickTimer.Start();
    }

    private void OnTick()
    {
        int blueIncome = 0;
        int redIncome = 0;

        foreach (var zone in _zones)
        {
            if (zone.OwnerTeam == "Player") blueIncome += zone.PointsPerSecond;
            else if (zone.OwnerTeam == "Enemy") redIncome += zone.PointsPerSecond;
        }

        if (blueIncome > 0 || redIncome > 0)
        {
            AddScore(blueIncome, redIncome);
        }
    }

    private void AddScore(int blue, int red)
    {
        BlueScore += blue;
        RedScore += red;

        EmitSignal(SignalName.ScoreUpdated, BlueScore, RedScore);
        CheckWinCondition();
    }

    private void CheckWinCondition()
    {
        if (BlueScore >= VictoryThreshold)
        {
            EndMatch("Player");
        }
        else if (RedScore >= VictoryThreshold)
        {
            EndMatch("Enemy");
        }
    }

    private void EndMatch(string winner)
    {
        _tickTimer.Stop();
        EmitSignal(SignalName.MatchEnded, winner);
        GD.Print($"MATCH ENDED! Winner: {winner}");
    }
}
