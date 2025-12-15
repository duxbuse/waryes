using Godot;
using System;

public partial class EconomyManager : Node
{
    [Signal]
    public delegate void CreditsChangedEventHandler(int newAmount);

    [Export]
    public int StartingCredits { get; set; } = 1500;

    [Export]
    public int IncomePerTick { get; set; } = 10;

    [Export]
    public float TickDuration { get; set; } = 4.0f; // Seconds per income tick

    public int CurrentCredits { get; private set; }

    private Timer _incomeTimer;

    public override void _Ready()
    {
        CurrentCredits = StartingCredits;
        
        _incomeTimer = new Timer();
        _incomeTimer.WaitTime = TickDuration;
        _incomeTimer.Autostart = false; // Starts when match begins
        _incomeTimer.OneShot = false;
        _incomeTimer.Timeout += OnIncomeTick;
        AddChild(_incomeTimer);
    }

    public void StartEconomy()
    {
        _incomeTimer.Start();
    }

    public void StopEconomy()
    {
        _incomeTimer.Stop();
    }

    private void OnIncomeTick()
    {
        AddCredits(IncomePerTick);
    }

    public bool CanAfford(int cost)
    {
        return CurrentCredits >= cost;
    }

    public bool SpendCredits(int amount)
    {
        if (CanAfford(amount))
        {
            CurrentCredits -= amount;
            EmitSignal(SignalName.CreditsChanged, CurrentCredits);
            return true;
        }
        return false;
    }

    public void AddCredits(int amount)
    {
        CurrentCredits += amount;
        EmitSignal(SignalName.CreditsChanged, CurrentCredits);
    }
    
    public void RefundCredits(int amount)
    {
         AddCredits(amount);
    }
}
