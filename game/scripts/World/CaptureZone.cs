using Godot;
using System.Collections.Generic;

public partial class CaptureZone : Area3D
{
    [Export]
    public int PointsPerSecond { get; set; } = 1;

    [Export]
    public float CaptureTime { get; set; } = 10.0f;

    // "Neutral", "Player", "Enemy"
    public string OwnerTeam { get; private set; } = "Neutral";
    
    // Visuals
    private MeshInstance3D _visualMesh;
    // State
    private float _captureProgress = 0.0f; // 0..CaptureTime
    private string _capturingTeam = ""; // Team currently influencing logic
    private Vector3 _captureStartPosLocal = Vector3.Zero;
    
    private List<Unit> _unitsInZone = new List<Unit>();

    public override void _Ready()
    {
        BodyEntered += OnBodyEntered;
        BodyExited += OnBodyExited;

        // Register with Manager
        CallDeferred(nameof(Register));
        
        // Setup Visuals
        _visualMesh = GetNodeOrNull<MeshInstance3D>("MeshInstance3D");
        if (_visualMesh != null)
        {
            var shader = GD.Load<Shader>("res://art/shaders/CaptureZone.gdshader");
            var shaderMat = new ShaderMaterial();
            shaderMat.Shader = shader;
            _visualMesh.MaterialOverride = shaderMat;
            _material = shaderMat; // Keep ref as ShaderMaterial implicitly cast? No, need explicit field or cast
            
            UpdateVisuals();
        }
    }
    
    // Changing type to generic Material or ShaderMaterial
    private Material _material; 

    private void Register()
    {
        ObjectiveManager.Instance?.RegisterZone(this);
    }

    private void OnBodyEntered(Node body)
    {
        if (body is Unit unit)
        {
            _unitsInZone.Add(unit);
            GD.Print($"Unit {unit.Name} entered zone.");
        }
    }

    private void OnBodyExited(Node body)
    {
        if (body is Unit unit)
        {
            _unitsInZone.Remove(unit);
        }
    }

    public override void _Process(double delta)
    {
        // Check for Commanders
        bool blueCommander = false;
        bool redCommander = false;
        Unit firstCommander = null;

        foreach (var unit in _unitsInZone)
        {
            if (!IsInstanceValid(unit)) continue;
            if (unit.IsCommander)
            {
                if (firstCommander == null) firstCommander = unit;
                
                if (unit.Team == "Player") blueCommander = true;
                else if (unit.Team == "Enemy") redCommander = true;
            }
        }

        // Logic
        if (blueCommander && !redCommander)
        {
            ProcessCapture("Player", (float)delta, firstCommander);
        }
        else if (redCommander && !blueCommander)
        {
            ProcessCapture("Enemy", (float)delta, firstCommander);
        }
        else
        {
            // Contested or Empty -> Decay progress
            if (_capturingTeam != "" && _capturingTeam != OwnerTeam)
            {
                DecayCapture((float)delta);
            }
        }
        
        UpdateVisuals();
    }

    private void ProcessCapture(string team, float delta, Unit commander)
    {
        if (OwnerTeam == team) return; // Already owned

        if (_capturingTeam != team && _capturingTeam != "")
        {
            DecayCapture(delta);
            return;
        }

        if (_capturingTeam == "")
        {
            // Start Capture
            _capturingTeam = team;
            // Record start pos relative to zone center
            _captureStartPosLocal = ToLocal(commander.GlobalPosition);
            _captureStartPosLocal.Y = 0; // Flatten
        }

        _capturingTeam = team;
        _captureProgress += delta;

        if (_captureProgress >= CaptureTime)
        {
            OwnerTeam = team;
            _captureProgress = 0;
            _capturingTeam = "";
            GD.Print($"Zone Captured by {team}!");
        }
    }
    
    private void DecayCapture(float delta)
    {
        _captureProgress -= delta;
        if (_captureProgress <= 0)
        {
            _captureProgress = 0;
            _capturingTeam = "";
        }
    }

    private void UpdateVisuals()
    {
        if (_material == null) return;
        var mat = _material as ShaderMaterial;
        if (mat == null) return;
        
        // Colors
        Color neutral = new Color(0.2f, 0.2f, 0.2f, 0.3f);
        if (OwnerTeam == "Player") neutral = new Color(0, 0, 1, 0.3f); // Blue base if owned
        else if (OwnerTeam == "Enemy") neutral = new Color(1, 0, 0, 0.3f); // Red base if owned
        
        Color fill = new Color(1, 1, 1, 0.5f);
        if (_capturingTeam == "Player") fill = new Color(0, 0, 1, 0.6f);
        else if (_capturingTeam == "Enemy") fill = new Color(1, 0, 0, 0.6f);
        
        mat.SetShaderParameter("neutral_color", neutral);
        mat.SetShaderParameter("fill_color", fill);
        
        // Progress
        float p = 0;
        if (CaptureTime > 0) p = _captureProgress / CaptureTime;
        mat.SetShaderParameter("progress", p);
        
        // Start Pos
        mat.SetShaderParameter("start_pos_local", _captureStartPosLocal);
    }
}
