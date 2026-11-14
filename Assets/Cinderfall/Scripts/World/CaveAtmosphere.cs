using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.World
{
    /// <summary>
    /// Blends lighting and atmosphere between the surface and the cave based on how far the
    /// listener (player or rover camera) is along the cave path from the mouth.
    /// The cave is part of the same scene, so the transition is a continuous walk-in:
    /// sun, ambient, reflections and fog fade with depth instead of switching abruptly.
    /// </summary>
    public class CaveAtmosphere : MonoBehaviour
    {
        public static CaveAtmosphere Instance { get; private set; }

        [Tooltip("Path points from the cave mouth inward (world space). Depth is distance along this path.")]
        public Vector3[] path;
        [Tooltip("Maximum lateral distance from the path that still counts as 'inside'.")]
        public float pathRadius = 30f;
        public float twilightDepth = 12f;
        public float darkDepth = 45f;

        public Light sun;
        public Color caveAmbient = new Color(0.035f, 0.03f, 0.03f);
        public Color caveFog = new Color(0.03f, 0.025f, 0.022f);
        public float caveFogDensity = 0.018f;

        /// <summary>0 = open surface, 1 = deep cave.</summary>
        public float Darkness { get; private set; }
        public bool PlayerInside { get; private set; }
        public float Depth { get; private set; }

        float sunIntensity, reflection, fogDensity, ambientIntensity;
        Color fogColor, ambientSky, ambientEquator, ambientGround;
        UnityEngine.Rendering.AmbientMode ambientMode;

        void Awake()
        {
            Instance = this;
            if (sun) sunIntensity = sun.intensity;
            reflection = RenderSettings.reflectionIntensity;
            fogDensity = RenderSettings.fogDensity;
            fogColor = RenderSettings.fogColor;
            ambientIntensity = RenderSettings.ambientIntensity;
            ambientSky = RenderSettings.ambientSkyColor;
            ambientEquator = RenderSettings.ambientEquatorColor;
            ambientGround = RenderSettings.ambientGroundColor;
            ambientMode = RenderSettings.ambientMode;
        }

        void OnDestroy() => Restore();

        void Restore()
        {
            if (sun) sun.intensity = sunIntensity;
            RenderSettings.reflectionIntensity = reflection;
            RenderSettings.fogDensity = fogDensity;
            RenderSettings.fogColor = fogColor;
            RenderSettings.ambientIntensity = ambientIntensity;
            RenderSettings.ambientMode = ambientMode;
            RenderSettings.ambientSkyColor = ambientSky;
            RenderSettings.ambientEquatorColor = ambientEquator;
            RenderSettings.ambientGroundColor = ambientGround;
        }

        /// <summary>Depth along the cave path for a world position; negative when outside.</summary>
        public float DepthAt(Vector3 p, out float lateral)
        {
            lateral = float.MaxValue;
            if (path == null || path.Length < 2) return -1f;
            float best = -1f, acc = 0f;
            for (int i = 0; i < path.Length - 1; i++)
            {
                Vector3 a = path[i], b = path[i + 1];
                Vector3 ab = b - a; float len = ab.magnitude;
                float t = Mathf.Clamp01(Vector3.Dot(p - a, ab) / (len * len));
                float d = Vector3.Distance(p, a + ab * t);
                if (d < lateral) { lateral = d; best = acc + t * len; if (i == 0 && t <= 0f) best = -Vector3.Distance(p, a); }
                acc += len;
            }
            return best;
        }

        void LateUpdate()
        {
            var cam = Camera.main;
            if (cam == null) return;
            float depth = DepthAt(cam.transform.position, out float lateral);
            PlayerInside = depth > 0f && lateral < pathRadius;
            Depth = PlayerInside ? depth : 0f;
            float target = PlayerInside ? Mathf.InverseLerp(twilightDepth * 0.25f, darkDepth, depth) : 0f;
            target = Mathf.SmoothStep(0f, 1f, target);
            Darkness = Mathf.MoveTowards(Darkness, target, Time.deltaTime * 0.6f);

            float k = Darkness;
            if (sun) sun.intensity = Mathf.Lerp(sunIntensity, 0f, k);
            RenderSettings.reflectionIntensity = Mathf.Lerp(reflection, 0.05f, k);
            RenderSettings.fogDensity = Mathf.Lerp(fogDensity, caveFogDensity, k);
            RenderSettings.fogColor = Color.Lerp(fogColor, caveFog, k);
            if (k > 0.001f)
            {
                RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = Color.Lerp(ambientSky, caveAmbient, k);
                RenderSettings.ambientEquatorColor = Color.Lerp(ambientEquator, caveAmbient, k);
                RenderSettings.ambientGroundColor = Color.Lerp(ambientGround, caveAmbient * 0.6f, k);
            }
            else if (RenderSettings.ambientMode != ambientMode) Restore();

            WorldState.SetValue("cave.depth", Depth);
        }
    }
}
