using UnityEngine;

namespace Cinderfall.World
{
    /// <summary>Slow beacon blink for survey beacons and status lamps (light + optional emissive renderer).</summary>
    public class BlinkingLight : MonoBehaviour
    {
        public Light target;
        public Renderer lamp;
        public Color color = new Color(1f, 0.55f, 0.2f);
        public float period = 2.2f;
        public float onFraction = 0.18f;
        public float intensity = 2.5f;
        public float phase;
        MaterialPropertyBlock mpb;

        void Awake()
        {
            mpb = new MaterialPropertyBlock();
            if (phase == 0f) phase = Random.value * period;
        }

        void Update()
        {
            float t = Mathf.Repeat(Time.time + phase, period) / period;
            float k = t < onFraction ? Mathf.Sin(t / onFraction * Mathf.PI) : 0f;
            if (target) { target.color = color; target.intensity = intensity * k; target.enabled = k > 0.01f; }
            if (lamp)
            {
                lamp.GetPropertyBlock(mpb);
                mpb.SetColor("_EmissionColor", color * (0.15f + 4f * k));
                lamp.SetPropertyBlock(mpb);
            }
        }
    }
}
