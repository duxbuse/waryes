using Godot;
using WarYes.Data;
using System.Collections.Generic;

namespace WarYes.Units.Components
{
    public partial class UnitMovementController : Node3D
    {
        private Unit _unit;
        private UnitData _data;
        private NavigationAgent3D _navAgent;
        
        // Lane Logic
        private float _laneOffset = 0.0f; 
        private float _targetLaneOffset = 0.0f; 
        private bool _isOvertaking = false;
        private float _overtakeTimer = 0.0f;
        private const float ROAD_LANE_WIDTH = 2.5f;
        
        // Path visual update timing
        private float _pathUpdateTimer = 0.0f;
        private const float PATH_UPDATE_INTERVAL = 0.1f; // Update path every 0.1 seconds

        public bool IsMoving { get; private set; } = false;
        
        public void Initialize(Unit unit, UnitData data)
        {
            _unit = unit;
            _data = data;
            Name = "MovementController";
            
            _navAgent = new NavigationAgent3D();
            _navAgent.PathDesiredDistance = 1.0f;
            _navAgent.TargetDesiredDistance = 1.0f;
            _navAgent.AvoidanceEnabled = true;
            _navAgent.Radius = 1.0f; 
            _navAgent.NeighborDistance = 10.0f;
            
            float speedKmh = _data.Speed.Road > 0 ? _data.Speed.Road : 30.0f;
            float speedMs = speedKmh / 3.6f;
            
            if (_data.Tags.Contains("air"))
            {
                speedMs = Mathf.Min(speedMs, 15.0f); 
            }
            
            _navAgent.MaxSpeed = speedMs;
            _navAgent.VelocityComputed += OnVelocityComputed;
            
            AddChild(_navAgent);
        }
        
        public void MoveTo(Vector3 target)
        {
            _navAgent.TargetPosition = target;
            IsMoving = true;
            // Defer path update to next frame to allow NavigationAgent to calculate path
            CallDeferred(nameof(UpdatePathVisuals));
        }
        
        public void Stop()
        {
            IsMoving = false;
            _navAgent.Velocity = Vector3.Zero;
            _unit.Velocity = Vector3.Zero;
        }
        
        public bool IsNavigationFinished() => _navAgent.IsNavigationFinished();
        public Vector3 GetNextPathPosition() => _navAgent.GetNextPathPosition();
        
        public override void _PhysicsProcess(double delta)
        {
            if (_unit == null || _unit.IsFrozen) return;
            if (!IsMoving) return;
            
            if (_navAgent.IsNavigationFinished())
            {
                IsMoving = false;
                _unit.Velocity = Vector3.Zero;
                // Clear path visuals when navigation finishes
                if (_unit.Visuals != null)
                {
                    _unit.Visuals.UpdatePathVisuals(null, _unit.CurrentMoveMode);
                }
                return;
            }
            
            Vector3 currentAgentPosition = _unit.GlobalTransform.Origin;
            Vector3 nextPathPosition = _navAgent.GetNextPathPosition();
            
            Vector3 desiredVelocity = (nextPathPosition - currentAgentPosition).Normalized();
            desiredVelocity *= _navAgent.MaxSpeed;
            
            // Lane Logic for Fast Move
            if (_unit.CurrentMoveMode == Unit.MoveMode.Fast && !_data.Tags.Contains("air"))
            {
                desiredVelocity = ApplyLaneLogic(currentAgentPosition, nextPathPosition);
            }
            
            _navAgent.Velocity = desiredVelocity;
            
            // Blinker visual update?
            float blinkerSpeed = 5.0f * (float)delta; 
            _laneOffset = Mathf.Lerp(_laneOffset, _targetLaneOffset, blinkerSpeed);
            
            // Update path visuals periodically to reduce overhead and prevent persistence
            _pathUpdateTimer += (float)delta;
            if (_pathUpdateTimer >= PATH_UPDATE_INTERVAL)
            {
                _pathUpdateTimer = 0.0f;
                UpdatePathVisuals();
            }
        }
        
        private void UpdatePathVisuals()
        {
            if (_unit == null || _unit.Visuals == null) return;
            
            // Always update path visuals even if frozen (for setup phase planning)
            // The path will still be generated even if unit can't move yet
            Vector3[] path = _navAgent.GetCurrentNavigationPath();
            _unit.Visuals.UpdatePathVisuals(path, _unit.CurrentMoveMode);
        }
        
        private void OnVelocityComputed(Vector3 safeVelocity)
        {
             if (_unit.IsFrozen) return;
             
             if (safeVelocity.LengthSquared() <= 0.01f)
             {
                 _unit.Velocity = Vector3.Zero;
                 _unit.MoveAndSlide();
                 return;
             }

             bool isVehicle = _data.Tags.Contains("vehicle");
             bool isAir = _data.Tags.Contains("air");
             
             ApplyRotationLogic(safeVelocity, isVehicle, isAir);
             
             _unit.Velocity = safeVelocity;
             _unit.MoveAndSlide();
        }
        
        private Vector3 ApplyLaneLogic(Vector3 currentPos, Vector3 targetPos)
        {
            Vector3 pathDir = (targetPos - currentPos).Normalized();
            if (pathDir.LengthSquared() < 0.01f) return Vector3.Zero;
            
            Vector3 rightVec = Vector3.Up.Cross(pathDir).Normalized();
            
            UpdateOvertakeStatus(currentPos, pathDir, rightVec);
            
            Vector3 offsetVector = rightVec * _laneOffset;
            Vector3 laneTargetPos = targetPos + offsetVector;
            
            return (laneTargetPos - currentPos).Normalized() * _navAgent.MaxSpeed;
        }

        private void UpdateOvertakeStatus(Vector3 currentPos, Vector3 fwd, Vector3 right)
        {
            float desiredOffset = -ROAD_LANE_WIDTH; 
            
            bool blocked = CheckLaneBlocked(currentPos, fwd, _laneOffset);
            
            if (blocked && !_isOvertaking)
            {
                bool rightClear = !CheckLaneBlocked(currentPos, fwd, ROAD_LANE_WIDTH, 15.0f); 
                if (rightClear && CanFitInLane(currentPos, right, ROAD_LANE_WIDTH))
                {
                    _isOvertaking = true;
                    _overtakeTimer = 4.0f; 
                }
            }
            
            if (_isOvertaking)
            {
                desiredOffset = ROAD_LANE_WIDTH; 
                _overtakeTimer -= (float)GetPhysicsProcessDeltaTime();
                
                if (_overtakeTimer <= 0)
                {
                     bool leftClear = !CheckLaneBlocked(currentPos, fwd, -ROAD_LANE_WIDTH, 12.0f);
                     if (leftClear) _isOvertaking = false;
                     else _overtakeTimer = 0.5f; 
                }
            }
            
            _targetLaneOffset = desiredOffset;
        }
        
        private bool CheckLaneBlocked(Vector3 pos, Vector3 dir, float laneOffset, float dist = 8.0f)
        {
            Vector3 right = Vector3.Up.Cross(dir).Normalized();
            Vector3 origin = pos + (right * laneOffset) + Vector3.Up * 1.0f;
            Vector3 to = origin + (dir * dist);
            
            var query = PhysicsRayQueryParameters3D.Create(origin, to);
            query.Exclude = new Godot.Collections.Array<Godot.Rid> { _unit.GetRid() };
            
            var result = GetWorld3D().DirectSpaceState.IntersectRay(query);
            if (result.Count > 0)
            {
                var col = result["collider"].As<Node>();
                if (col is Unit u && u.Team == _unit.Team) return true; 
                if (col is StaticBody3D) return true;
            }
            return false;
        }
        
        private bool CanFitInLane(Vector3 pos, Vector3 right, float laneOffset)
        {
             Vector3 targetOrigin = pos + (right * laneOffset) + Vector3.Up * 1.0f;
             var query = PhysicsRayQueryParameters3D.Create(targetOrigin, targetOrigin + Vector3.Forward * 2.0f);
             var result = GetWorld3D().DirectSpaceState.IntersectRay(query);
             
             if (result.Count > 0)
             {
                 var col = result["collider"].As<Node>();
                 if (col is StaticBody3D) return false; 
             }
             return true; 
        }

        private void ApplyRotationLogic(Vector3 safeVelocity, bool isVehicle, bool isAir)
        {
            if (_unit.CurrentMoveMode == Unit.MoveMode.Reverse && isVehicle && !isAir)
            {
                Vector3 moveDir = safeVelocity.Normalized();
                if (moveDir.LengthSquared() < 0.01f) return;

                Vector3 lookTarget = _unit.GlobalPosition - moveDir;
                Vector3 direction = (lookTarget - _unit.GlobalPosition).Normalized();
                Vector3 currentForward = -_unit.GlobalTransform.Basis.Z;
                float angle = currentForward.AngleTo(direction);

                float rotSpeedDeg = _data.Speed.RotationSpeed.HasValue ? _data.Speed.RotationSpeed.Value : 90.0f;
                float maxRotStep = Mathf.DegToRad(rotSpeedDeg) * (float)GetPhysicsProcessDeltaTime();

                if (angle > 0.01f)
                {
                    Vector3 cross = currentForward.Cross(direction);
                    float sign = (cross.Y > 0) ? 1.0f : -1.0f;
                    float rotAmount = Mathf.Min(angle, maxRotStep);
                    _unit.RotateY(rotAmount * sign);
                }
                return;
            }

            if (isVehicle && !isAir)
            {
                Vector3 lookTarget = _unit.GlobalPosition + safeVelocity;
                Vector3 direction = (lookTarget - _unit.GlobalPosition).Normalized();
                
                Vector3 currentForward = -_unit.GlobalTransform.Basis.Z;
                float angle = currentForward.AngleTo(direction);
                
                float rotSpeedDeg = _data.Speed.RotationSpeed.HasValue ? _data.Speed.RotationSpeed.Value : 90.0f;
                float maxRotStep = Mathf.DegToRad(rotSpeedDeg) * (float)GetPhysicsProcessDeltaTime();
                
                if (angle > 0.01f)
                {
                    Vector3 cross = currentForward.Cross(direction);
                    float sign = (cross.Y > 0) ? 1.0f : -1.0f;
                    float rotAmount = Mathf.Min(angle, maxRotStep);
                    _unit.RotateY(rotAmount * sign);
                }
                return;
            }
            
            // Standard/Infantry/Air (Instant/Fast turn)
            Vector3 standardLookTarget = _unit.GlobalPosition + safeVelocity;
            Vector3 standardLookAt = new Vector3(standardLookTarget.X, _unit.GlobalPosition.Y, standardLookTarget.Z);
            if (!standardLookAt.IsEqualApprox(_unit.GlobalPosition))
            {
                 _unit.LookAt(standardLookAt, Vector3.Up);
            }
        }
        
        public Vector3[] GetCurrentPath() => _navAgent.GetCurrentNavigationPath();
    }
}
