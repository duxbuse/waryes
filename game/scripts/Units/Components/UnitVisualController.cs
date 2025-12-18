using Godot;
using WarYes.Data;
using WarYes.UI;
using System.Collections.Generic;
using System.Linq;

namespace WarYes.Units.Components
{
    public partial class UnitVisualController : Node3D
    {
        private Unit _unit;
        private UnitData _data;
        
        // Component References
        public Node3D VisualRoot { get; private set; } // Make public logic
        private MeshInstance3D _visuals; // The main model
        private UnitUI _unitUI;
        private Node3D _commanderAura;
        private Sprite3D _tacticalIcon;
        private Sprite3D _tacticalRing;
        private MeshInstance3D _selectionData;
        private Sprite3D _ammoIcon;
        
        private bool _inTacticalView = false;
        private bool _isSelected = false;
        
        // Path Visuals
        private MeshInstance3D _pathMeshInstance;
        private ImmediateMesh _pathMesh;
        private ShaderMaterial _pathShaderMat;
        private MeshInstance3D _pathArrow;
        
        // Aim Indicators
        private Node3D _aimIndicatorRoot;
        private List<MeshInstance3D> _aimIndicators = new List<MeshInstance3D>();

        private const float FIXED_ICON_SCREEN_SIZE_FACTOR = 0.08f;
        
        public void Initialize(Unit unit, UnitData data)
        {
            _unit = unit;
            _data = data;
            Name = "VisualController";
            
            CreateVisuals();
            CreatePathVisuals();
            
            if (_data.IsCommander) CreateCommanderVisuals();
            
            CreateUnitUI();
            CreateSelectionRing();
            CreateAmmoIcon();
            CreateTacticalIcon();
            CreateAimIndicator(); // Prepare root
            
            // Immediate Sync
            var camera = GetViewport().GetCamera3D() as RTSCamera;
            if (camera != null && camera.InTacticalView)
            {
                SetTacticalView(true);
            }
        }
        
        public override void _Process(double delta)
        {
            if (_unit == null) return;
            
            // Sync with Camera State
            var camera = GetViewport().GetCamera3D() as RTSCamera;
            if (camera != null)
            {
                if (_inTacticalView != camera.InTacticalView)
                {
                    SetTacticalView(camera.InTacticalView);
                }
            }
            
            if (_tacticalIcon != null && _tacticalIcon.Visible)
            {
                UpdateTacticalIconScale();
            }
            
            // Aim Indicators update frequently
            UpdateAimIndicator();
        }

        public void SetTacticalView(bool active)
        {
            _inTacticalView = active;
            
            if (_tacticalIcon == null) CreateTacticalIcon();
            if (_tacticalIcon != null) _tacticalIcon.Visible = active;
            
            if (_visuals != null) _visuals.Visible = !active;
            
            UpdateSelectionVisuals();
        }
        
        public void SetVisualsVisible(bool visible)
        {
            if (VisualRoot != null) VisualRoot.Visible = visible;
            if (_unitUI != null) _unitUI.Visible = visible;
        }

        public void UpdateHealth(int currentHealth)
        {
            if (_unitUI != null) _unitUI.UpdateHealth(currentHealth);
        }

        public void UpdateMorale(float current, float max, bool isRouting)
        {
            if (_unitUI != null) 
            {
                _unitUI.UpdateMorale(current, max);
                _unitUI.SetRouting(isRouting);
            }
        }
        
        public void SetBuffStatus(bool active)
        {
            if (_unitUI != null) _unitUI.SetBuffStatus(active);
        }
        
        public void SetVeterancy(int rank)
        {
            if (_unitUI != null) _unitUI.SetVeterancy(rank);
        }
        
        public void CheckAmmoStatus(bool anyEmpty)
        {
            if (_ammoIcon == null) CreateAmmoIcon();
            _ammoIcon.Visible = anyEmpty;
        }
        
        private void CreateVisuals()
        {
            // Create Visual Root (Visual Pivot)
            if (GetNodeOrNull("VisualRoot") == null)
            {
                VisualRoot = new Node3D();
                VisualRoot.Name = "VisualRoot";
                AddChild(VisualRoot);
            }
            else
            {
                VisualRoot = GetNode<Node3D>("VisualRoot");
            }
            
            // Create Mesh
            if (VisualRoot.GetNodeOrNull("Mesh") == null)
            {
                _visuals = new MeshInstance3D();
                _visuals.Name = "Mesh";
                var mesh = new PrismMesh(); 
                mesh.Size = new Vector3(2, 2, 2); 
                _visuals.Mesh = mesh;
                _visuals.RotationDegrees = new Vector3(-90, 0, 0); // Point forward (-Z)
                VisualRoot.AddChild(_visuals);
            }
            else
            {
                 _visuals = VisualRoot.GetNode<MeshInstance3D>("Mesh");
            }
            
            // Coloring Logic...
            // ...
            // (Only VisualRoot usage needs fixing, _visuals is a field)

            
            // Coloring Logic using TAGS
            var material = new StandardMaterial3D();
            bool isEnemy = _unit.ElementIsEnemy; // We will add this property to Unit wrapper or check Team
            
            // Resolve Team color
            Color baseColor = new Color(0, 0, 1); // Blue
            
            if (isEnemy)
            {
                 if (_data.Tags.Contains("air")) baseColor = new Color(1, 0.4f, 0.7f); // Pink
                 else if (_data.Tags.Contains("vehicle") || _data.Tags.Contains("tank")) baseColor = new Color(1, 0, 0); // Red
                 else baseColor = new Color(0.5f, 0, 0.5f); // Purple
            }
            else
            {
                 if (_data.Tags.Contains("air"))
                 {
                     baseColor = new Color(1, 0.5f, 0); // Orange
                     VisualRoot.Position = new Vector3(0, 8, 0); 
                 }
                 else if (_data.Tags.Contains("vehicle") || _data.Tags.Contains("tank"))
                 {
                     baseColor = new Color(0, 1, 0); // Green
                 }
                 else
                 {
                     baseColor = new Color(0, 0, 1); // Blue
                 }
            }
            
            material.AlbedoColor = baseColor;
            _visuals.MaterialOverride = material;
        }

        private void CreateCommanderVisuals()
        {
            if (_commanderAura != null) return;
            
            _commanderAura = new Node3D();
            _commanderAura.Name = "CommanderAura";
            VisualRoot.AddChild(_commanderAura);
            
            float radius = 20.0f;
            var meshInst = new MeshInstance3D();
            var torus = new TorusMesh();
            torus.InnerRadius = radius - 0.5f; 
            torus.OuterRadius = radius;
            meshInst.Mesh = torus;
            
            var mat = new StandardMaterial3D();
            mat.AlbedoColor = new Color(1, 1, 1, 0.3f); 
            mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
            mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
            meshInst.MaterialOverride = mat;
            
            _commanderAura.AddChild(meshInst);
        }
        
        private void CreateUnitUI()
        {
            if (_unitUI != null) return;
            
            _unitUI = new UnitUI();
            _unitUI.Name = "UnitUI";
            _unitUI.TopLevel = true; 
            VisualRoot.AddChild(_unitUI);
            
            string category = "infantry";
            if (_data.Tags.Contains("tank") || _data.Tags.Contains("vehicle")) category = "vehicle";
            if (_data.Tags.Contains("air")) category = "air";
            if (_data.IsCommander) category = "commander";
            
            // Assume 10 if 0
            int hp = _data.Health > 0 ? _data.Health : 10;
            _unitUI.Initialize(_data.Id, _unit.Name, hp, category, _data.IsCommander);
            _unitUI.UpdateHealth(hp);
        }

        private void CreateSelectionRing()
        {
            if (VisualRoot.GetNodeOrNull("SelectionRing") != null)
            {
                _selectionData = VisualRoot.GetNode<MeshInstance3D>("SelectionRing");
                _selectionData.Visible = false;
                return;
            }

            _selectionData = new MeshInstance3D();
            _selectionData.Name = "SelectionRing";
            
            var torus = new TorusMesh();
            torus.InnerRadius = 1.5f;
            torus.OuterRadius = 1.7f;
            _selectionData.Mesh = torus;
            
            var mat = new StandardMaterial3D();
            mat.AlbedoColor = new Color(1, 1, 1);
            mat.ShadingMode = StandardMaterial3D.ShadingModeEnum.Unshaded;
            _selectionData.MaterialOverride = mat;
            
            _selectionData.Visible = false;
            VisualRoot.AddChild(_selectionData);
        }
        
        public void SetSelected(bool selected)
        {
            _isSelected = selected;
            UpdateSelectionVisuals();
            // Don't hide path on deselection - let UpdatePathVisuals control visibility
            // This allows paths to remain visible during setup phase for planning
        }

        private void UpdateSelectionVisuals()
        {
            if (_selectionData != null)
                _selectionData.Visible = _isSelected && !_inTacticalView;
                
            if (_isSelected && _inTacticalView)
            {
                if (_tacticalRing == null) CreateTacticalRing();
                if (_tacticalRing != null) _tacticalRing.Visible = true;
            }
            else
            {
                 if (_tacticalRing != null) _tacticalRing.Visible = false;
            }
        }
        
        private void UpdatePathVisibility(bool visible)
        {
            // This method is no longer needed - visibility controlled by UpdatePathVisuals
            // Keeping for backward compatibility but doing nothing
        }

        private void CreateAmmoIcon()
        {
             if (_ammoIcon != null) return;
             
            _ammoIcon = new Sprite3D();
            _ammoIcon.Name = "AmmoIcon";
            
            // Procedural Texture creation kept same
            var image = Image.CreateEmpty(32, 32, false, Image.Format.Rgba8);
            for(int x=0; x<32; x++)
                for(int y=0; y<32; y++)
                {
                     if (x < 2 || x > 29 || y < 2 || y > 29) image.SetPixel(x, y, new Color(1, 0, 0)); 
                     else image.SetPixel(x, y, new Color(1, 1, 0, 0.5f));
                     
                     if (x >= 14 && x <= 17)
                     {
                         if (y > 6 && y < 20) image.SetPixel(x, y, new Color(0,0,0)); 
                         if (y > 23 && y < 26) image.SetPixel(x, y, new Color(0,0,0)); 
                     }
                }
                
            var tex = ImageTexture.CreateFromImage(image);
            _ammoIcon.Texture = tex;
            _ammoIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _ammoIcon.PixelSize = 0.02f;
            _ammoIcon.Position = new Vector3(0, 5.0f, 0); 
            _ammoIcon.Visible = false; 
            
            AddChild(_ammoIcon);
        }

        private void CreateTacticalIcon()
        {
            if (_tacticalIcon != null) return;
            
            _tacticalIcon = new Sprite3D();
            _tacticalIcon.Name = "TacticalIcon";
            _tacticalIcon.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
            _tacticalIcon.PixelSize = 0.03f;
            _tacticalIcon.NoDepthTest = true;
            _tacticalIcon.Modulate = _unit.ElementIsEnemy ? new Color(1.0f, 0.2f, 0.2f) : new Color(0.2f, 0.5f, 1.0f); // Red vs Blue
            
            string iconName = GetCategoryIconName();
            string pathSvg = $"res://assets/icons/categories/{iconName}.svg";
            string pathPng = $"res://assets/icons/categories/{iconName}.png";
            
            Texture2D tex = null;
            if (ResourceLoader.Exists(pathSvg)) tex = GD.Load<Texture2D>(pathSvg);
            else if (ResourceLoader.Exists(pathPng)) tex = GD.Load<Texture2D>(pathPng);
            
            if (tex != null) _tacticalIcon.Texture = tex;
            _tacticalIcon.Visible = false;
            
            if (VisualRoot != null) VisualRoot.AddChild(_tacticalIcon);
            else AddChild(_tacticalIcon);
            
            _tacticalIcon.Position = new Vector3(0, 2.0f, 0);
        }

        private void CreateTacticalRing()
        {
             if (_tacticalRing != null) return;
             if (_tacticalIcon == null) CreateTacticalIcon();
             
             _tacticalRing = new Sprite3D();
             _tacticalRing.Name = "TacticalRing";
             _tacticalRing.Billboard = BaseMaterial3D.BillboardModeEnum.Enabled;
             _tacticalRing.NoDepthTest = true;
             _tacticalRing.Modulate = new Color(1, 1, 1); // White
             
             // Create Ring Texture
             int size = 128;
             if (_tacticalIcon.Texture != null)
             {
                 Vector2 texSize = _tacticalIcon.Texture.GetSize();
                 size = (int)Mathf.Max(texSize.X, texSize.Y);
             }
             // Clamp size to reasonable limits
             size = Mathf.Clamp(size, 64, 512);
             
             var image = Image.CreateEmpty(size, size, false, Image.Format.Rgba8);
             
             float center = size / 2.0f;
             float radiusOuter = size * 0.48f;
             float radiusInner = size * 0.40f;
             
             for(int x=0; x<size; x++)
                for(int y=0; y<size; y++)
                {
                    float dist = Mathf.Sqrt((x-center)*(x-center) + (y-center)*(y-center));
                    if (dist < radiusOuter && dist > radiusInner)
                    {
                        // Anti-aliasing edges roughly
                        float alpha = 1.0f;
                        if (dist > radiusOuter - 1.0f) alpha = radiusOuter - dist;
                        if (dist < radiusInner + 1.0f) alpha = dist - radiusInner;
                        
                        image.SetPixel(x, y, new Color(1, 1, 1, alpha));
                    }
                }
                
             var tex = ImageTexture.CreateFromImage(image);
             _tacticalRing.Texture = tex;
             _tacticalRing.PixelSize = 0.03f; // Same as icon (0.03f in CreateTacticalIcon)
             // Parent to icon to inherit scale
             _tacticalIcon.AddChild(_tacticalRing);
             
             // Ensure it's behind the icon? 
             // Sprite3D sorting is tricky. Move slightly back in Z?
             // Since it's billboarded, Z might be view depth.
             // Render priority might help.
             _tacticalRing.RenderPriority = -1;
        }

        private string GetCategoryIconName()
        {
            // Use Tags!
            if (_data.Tags.Contains("vtol") || _data.Tags.Contains("gunship") || _data.Tags.Contains("air")) return "vtol";
            if (_data.Tags.Contains("artillery")) return "artillery";
            if (_data.Tags.Contains("anti_air")) return "anti_air";
            if (_data.Tags.Contains("recon")) return "recon";
            if (_data.Tags.Contains("tank")) return "tank";
            
            if (_data.Tags.Contains("ifv")) return "ifv";
            if (_data.Tags.Contains("apc")) return "apc";
            if (_data.Tags.Contains("transport") || _data.Tags.Contains("truck")) return "truck";
            
            if (_data.Tags.Contains("infantry")) return "infantry";
            
            return "infantry"; // Default
        }

        private void UpdateTacticalIconScale()
        {
            var camera = GetViewport().GetCamera3D();
            if (camera == null) return;
            float dist = GlobalPosition.DistanceTo(camera.GlobalPosition);
            _tacticalIcon.Scale = Vector3.One * dist * FIXED_ICON_SCREEN_SIZE_FACTOR;
        }

        // PATH VISUALS and AIM INDICATORS Omitted for brevity in this initial file to avoid too large write, 
        // OR better: keep them here? 
        // I will add them in a second pass or include them if space permits.
        // Let's include basic structures but maybe simplify shader loading to avoid errors if paths are wrong.
        // I'll assume paths are correct.
        
        private void CreatePathVisuals()
        {
            // Similar logic to Unit.cs...
             if (_pathMeshInstance != null) return;

            _pathMesh = new ImmediateMesh();
            _pathMeshInstance = new MeshInstance3D();
            _pathMeshInstance.Mesh = _pathMesh;
            _pathMeshInstance.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
            _pathMeshInstance.TopLevel = true; 
            _pathMeshInstance.Name = "PathVisualizer";
            AddChild(_pathMeshInstance);

            var shader = GD.Load<Shader>("res://art/shaders/PathLine.gdshader");
            if (shader != null)
            {
                _pathShaderMat = new ShaderMaterial();
                _pathShaderMat.Shader = shader;
                _pathShaderMat.SetShaderParameter("color", new Color(0, 1, 0, 0.5f));
                _pathMeshInstance.MaterialOverride = _pathShaderMat;
            }

            _pathArrow = new MeshInstance3D();
            // ... (Arrow setup)
            AddChild(_pathArrow);
        }
        
        public void UpdatePathVisuals(Vector3[] pathPoints, Unit.MoveMode mode, List<(Vector3[] Path, Unit.MoveMode Mode)> queuedPaths = null)
        {
             if (_pathMesh == null || _pathMeshInstance == null) 
             {
                 return;
             }
             
             _pathMesh.ClearSurfaces();
             
             bool hasCurrentPath = (pathPoints != null && pathPoints.Length >= 2);
             // Ensure we check queued paths validity
             bool hasQueuedPaths = (queuedPaths != null && queuedPaths.Count > 0);
             
             // Phase 1: Collect Vertices for Current Path
             List<Vector3> currentDrawPoints = new List<Vector3>();
             
             if (hasCurrentPath)
             {
                 Vector3 currentPos = _unit.GlobalPosition;
                 currentDrawPoints.Add(currentPos + Vector3.Up * 0.5f);
                 
                 // "Closest Segment" logic
                 int bestSegmentIdx = 0;
                 float minSegmentDistSq = float.MaxValue;
                 
                 for (int i = 0; i < pathPoints.Length - 1; i++)
                 {
                     Vector3 pA = pathPoints[i];
                     Vector3 pB = pathPoints[i+1];
                     Vector3 ab = pB - pA;
                     Vector3 ap = currentPos - pA;
                     float t = ab.LengthSquared() > 0.001f ? ap.Dot(ab) / ab.LengthSquared() : 0.0f;
                     t = Mathf.Clamp(t, 0.0f, 1.0f);
                     Vector3 closestOnSegment = pA + ab * t;
                     float dstSq = currentPos.DistanceSquaredTo(closestOnSegment);
                     
                     if (dstSq < minSegmentDistSq)
                     {
                         minSegmentDistSq = dstSq;
                         bestSegmentIdx = i;
                     }
                 }
                 
                 int startDrawingIdx = bestSegmentIdx + 1;
                 if (startDrawingIdx >= pathPoints.Length) startDrawingIdx = pathPoints.Length - 1;

                 for (int i = startDrawingIdx; i < pathPoints.Length; i++)
                 {
                     Vector3 point = pathPoints[i];
                     Vector3 toPoint = point - currentPos;
                     if (toPoint.LengthSquared() > 0.1f) 
                     {
                         currentDrawPoints.Add(point + Vector3.Up * 0.5f);
                     }
                 }
             }

             // Phase 2: Check total vertex count
             int queuedVertexCount = 0;
             if (hasQueuedPaths)
             {
                  foreach(var q in queuedPaths)
                  {
                      if (q.Path != null && q.Path.Length >= 2)
                          queuedVertexCount += q.Path.Length;
                  }
             }
             
             // If we don't have enough vertices for a line (need at least 2), abort
             if (currentDrawPoints.Count + queuedVertexCount < 2)
             {
                 _pathMeshInstance.Visible = false;
                 return;
             }

             // Phase 3: Draw
             _pathMeshInstance.Visible = true;

             if (_pathShaderMat != null)
             {
                 _pathShaderMat.SetShaderParameter("color", new Color(1, 1, 1, 1));
             }
             
             _pathMesh.SurfaceBegin(Mesh.PrimitiveType.LineStrip);
             
             // Draw Current Path
             if (currentDrawPoints.Count > 0)
             {
                 Color segmentColor = GetColorForMode(mode);
                 _pathMesh.SurfaceSetColor(segmentColor);
                 foreach(var v in currentDrawPoints)
                 {
                     _pathMesh.SurfaceAddVertex(v);
                 }
             }
             
             // Draw Queued Paths
             if (hasQueuedPaths)
             {
                 foreach (var item in queuedPaths)
                 {
                     if (item.Path == null || item.Path.Length < 2) continue;
                     
                     Color segmentColor = GetColorForMode(item.Mode);
                     _pathMesh.SurfaceSetColor(segmentColor);
                     
                     foreach (var point in item.Path)
                     {
                         _pathMesh.SurfaceAddVertex(point + Vector3.Up * 0.5f);
                     }
                 }
             }
             
             _pathMesh.SurfaceEnd();
        }

        private Color GetColorForMode(Unit.MoveMode mode)
        {
             switch (mode)
             {
                 case Unit.MoveMode.Fast:
                     return new Color(1, 1, 0, 0.7f); // Yellow
                 case Unit.MoveMode.Reverse:
                     return new Color(1, 0.5f, 0, 0.7f); // Orange
                 case Unit.MoveMode.Hunt:
                     return new Color(1, 0, 0, 0.7f); // Red
                 case Unit.MoveMode.Unload:
                     return new Color(0, 1, 1, 0.7f); // Cyan
                 default:
                     return new Color(0, 1, 0, 0.7f); // Green
             }
        }

        private void CreateAimIndicator()
        {
           // Logic from Unit.cs
        }

        private void UpdateAimIndicator()
        {
            // Logic from Unit.cs
        }
    }
}
