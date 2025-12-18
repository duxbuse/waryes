using Godot;
using System.Collections.Generic;
using WarYes.Data;
using WarYes.UI;

public partial class DeploymentManager : Node
{
    // Dependencies (Inject or Find)
    private UnitManager _unitManager => GameManager.Instance.UnitManager;
    private EconomyManager _economyManager => GameManager.Instance.EconomyManager;
    private DeploymentUI _deploymentUI => GameManager.Instance.DeploymentUI;
    
    // Config
    private const double BASE_REINFORCEMENT_DELAY = 5.0;
    private const double CONVOY_STAGGER_DELAY = 1.5;

    // State
    private struct QueuedReinforcement
    {
        public UnitCard Card;
        public Vector3 SpawnOrigin;
        public Vector3 TargetPosition;
        public double UnlockTime;
        public bool IsUnloadAt;
    }
    private List<QueuedReinforcement> _reinforcementQueue = new List<QueuedReinforcement>();
    private Dictionary<Vector3, double> _spawnPointCooldowns = new Dictionary<Vector3, double>();
    
    private MeshInstance3D _deploymentZoneVisuals;
    private Aabb _deploymentBounds;

    public override void _Ready()
    {
        Name = "DeploymentManager";
    }

    public override void _Process(double delta)
    {
        if (GameManager.Instance.CurrentPhase == GameManager.GamePhase.Battle && _reinforcementQueue.Count > 0)
        {
            double time = Time.GetTicksMsec() / 1000.0;
            while (_reinforcementQueue.Count > 0)
            {
                var item = _reinforcementQueue[0];
                if (time >= item.UnlockTime)
                {
                    ExecuteQueuedReinforcement(item);
                    _reinforcementQueue.RemoveAt(0);
                }
                else
                {
                    break; 
                }
            }
        }
    }

    public void SetupDeploymentZones()
    {
        var nodes = GetTree().GetNodesInGroup("ReinforcePoints");
        List<Vector3> playerPoints = new List<Vector3>();
        foreach(Node n in nodes)
        {
             if (n is ReinforcePoint rp && rp.Team == "Player")
             {
                 playerPoints.Add(rp.GlobalPosition);
             }
        }
        
        Vector3 pos = new Vector3(-60, 10, 0);
        Vector3 size = new Vector3(80, 20, 200);

        if (playerPoints.Count > 0)
        {
             float minX = float.MaxValue, maxX = float.MinValue;
             float minZ = float.MaxValue, maxZ = float.MinValue;
            
             foreach(var p in playerPoints)
             {
                 if(p.X < minX) minX = p.X;
                 if(p.X > maxX) maxX = p.X;
                 if(p.Z < minZ) minZ = p.Z;
                 if(p.Z > maxZ) maxZ = p.Z;
             }
             
             Vector3 center = Vector3.Zero;
             foreach(var p in playerPoints) center += p;
             center /= playerPoints.Count;
             
             float pad = 40.0f;
             if (Mathf.Abs(center.X) > Mathf.Abs(center.Z)) // East-West
             {
                  float widthZ = (maxZ - minZ) + pad * 2;
                  if (widthZ < 100) widthZ = 100;
                  
                  bool isLeft = center.X < 0;
                  float edgeX = isLeft ? -200 : 200;
                  float depth = 80.0f;
                  
                  float centerX = isLeft ? (edgeX + depth/2) : (edgeX - depth/2);
                  pos = new Vector3(centerX, 10, center.Z);
                  size = new Vector3(depth, 20, widthZ);
             }
             else // North-South
             {
                  float widthX = (maxX - minX) + pad * 2;
                  if (widthX < 100) widthX = 100;
                  
                  bool isTop = center.Z < 0;
                  float edgeZ = isTop ? -200 : 200;
                  float depth = 80.0f;
                  
                  float centerZ = isTop ? (edgeZ + depth/2) : (edgeZ - depth/2);
                  pos = new Vector3(center.X, 10, centerZ);
                  size = new Vector3(widthX, 20, depth);
             }
        }

        _deploymentBounds = new Aabb(pos - size/2, size);

        _deploymentZoneVisuals = new MeshInstance3D();
        _deploymentZoneVisuals.Name = "DeploymentZone";
        
        var mesh = new BoxMesh();
        mesh.Size = size;
        _deploymentZoneVisuals.Mesh = mesh;
        
        var mat = new StandardMaterial3D();
        mat.AlbedoColor = new Color(0, 0, 1, 0.2f);
        mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
        mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
        _deploymentZoneVisuals.MaterialOverride = mat;
        
        _deploymentZoneVisuals.Position = pos;
        
        AddChild(_deploymentZoneVisuals);
        _deploymentZoneVisuals.Visible = true;
    }

    public void OnBattleStarted()
    {
        if (_deploymentZoneVisuals != null) _deploymentZoneVisuals.Visible = false;
    }

    public bool IsValidDeploymentPosition(Vector3 pos)
    {
         if (_deploymentBounds.Size == Vector3.Zero) return false; 
         bool insideX = pos.X >= _deploymentBounds.Position.X && pos.X <= _deploymentBounds.End.X;
         bool insideZ = pos.Z >= _deploymentBounds.Position.Z && pos.Z <= _deploymentBounds.End.Z;
         return insideX && insideZ;
    }

    public bool SpawnUnitFromCard(UnitCard card, Vector3 position, bool isUnloadAt = false)
    {
        if (card.AvailableCount > 0)
        {
            if (_economyManager.SpendCredits(card.Cost))
            {
                card.AvailableCount--;
                _deploymentUI?.UpdateCardVisuals(card);

                if (GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup)
                {
                     if (IsValidDeploymentPosition(position))
                     {
                         SpawnUnitInstant(card, position, null, false);
                         GD.Print($"DEPLOYMENT [Setup Phase]: Instant spawn of {card.UnitId} at {position}. Remaining: {card.AvailableCount}");
                     }
                     else
                     {
                         GD.Print("Cannot deploy here during Setup! Must be in blue zone.");
                         card.AvailableCount++;
                         _deploymentUI?.UpdateCardVisuals(card);
                         return false; 
                     }
                }
                else
                {
                     Vector3 spawnOrigin = position;
                     var rp = _unitManager.GetNearestReinforcePoint(position, "Player");
                     if (rp.HasValue) spawnOrigin = rp.Value;
                     else
                     {
                         GD.PrintErr("No spawn point found!");
                         _economyManager.AddCredits(card.Cost);
                         card.AvailableCount++;
                         _deploymentUI?.UpdateCardVisuals(card);
                         return false;
                     }

                     double now = Time.GetTicksMsec() / 1000.0;
                     double readyTime = now + BASE_REINFORCEMENT_DELAY;
                     
                     if (_spawnPointCooldowns.ContainsKey(spawnOrigin))
                     {
                         double lastScheduled = _spawnPointCooldowns[spawnOrigin];
                         if (lastScheduled > now)
                         {
                             readyTime = System.Math.Max(readyTime, lastScheduled + CONVOY_STAGGER_DELAY);
                         }
                     }
                     
                     _spawnPointCooldowns[spawnOrigin] = readyTime; 

                     var queueItem = new QueuedReinforcement
                     {
                         Card = card,
                         SpawnOrigin = spawnOrigin,
                         TargetPosition = position,
                         UnlockTime = readyTime,
                         IsUnloadAt = isUnloadAt
                     };
                     _reinforcementQueue.Add(queueItem);
                     GD.Print($"DEPLOYMENT [Battle Phase]: Queued {card.UnitId}. Arrival: {readyTime:F1}s.");
                }
                return true;
            }
            else
            {
                GD.Print($"Cannot afford {card.UnitId}");
                return false;
            }
        }
        else
        {
            GD.Print($"No availability for {card.UnitId}");
            return false;
        }
    }

    private void ExecuteQueuedReinforcement(QueuedReinforcement item)
    {
         SpawnUnitInstant(item.Card, item.SpawnOrigin, item.TargetPosition, item.IsUnloadAt);
    }

    private Unit SpawnUnitInstant(UnitCard card, Vector3 spawnPos, Vector3? moveTarget, bool isUnloadAt)
    {
        string actualUnitId = card.UnitId;
        bool hasTransport = !string.IsNullOrEmpty(card.TransportId);
        
        Unit transportUnit = null;
        Unit cargoUnit = null;
        Unit mainUnit = null; 
        
        if (hasTransport)
        {
            transportUnit = _unitManager.SpawnUnit(card.TransportId, spawnPos, card.Veterancy);
             if (transportUnit == null) return null;
            
            cargoUnit = _unitManager.SpawnUnit(card.UnitId, spawnPos, card.Veterancy);
            
            if (cargoUnit != null && transportUnit != null)
            {
                transportUnit.Mount(cargoUnit);
            }
            mainUnit = transportUnit;
        }
        else
        {
            cargoUnit = _unitManager.SpawnUnit(actualUnitId, spawnPos, card.Veterancy);
            mainUnit = cargoUnit;
        }

        if (GameManager.Instance.CurrentPhase == GameManager.GamePhase.Setup && mainUnit != null)
        {
            mainUnit.SetFrozen(true);
        }

        if (moveTarget.HasValue && mainUnit != null)
        {
            mainUnit.MoveTo(moveTarget.Value, Unit.MoveMode.Fast);
            
            if (isUnloadAt)
            {
                mainUnit.UnloadAt(moveTarget.Value, true);
            }
        }
        
        return mainUnit;
    }
}
