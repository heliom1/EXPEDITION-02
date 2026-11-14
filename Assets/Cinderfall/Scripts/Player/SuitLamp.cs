using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Player
{
    /// <summary>Helmet lamp: a spot light with a soft fill, toggled by the Flashlight action. Draws suit power.</summary>
    public class SuitLamp : MonoBehaviour
    {
        public Light spot;
        public Light fill;
        public float spotIntensity = 9f;
        public float fillIntensity = 0.5f;
        PlayerController player;
        float level;

        void Awake() { player = GetComponentInParent<PlayerController>(); }

        void Update()
        {
            var suit = SuitSystem.Instance;
            if (player != null && player.ControlEnabled && GameInput.Flashlight.WasPressedThisFrame())
            {
                if (suit != null && suit.Power <= 0f) { GameEvents.Notify("Suit power depleted: lamp unavailable.", NoticeKind.Warning); GameEvents.PlaySound("deny"); }
                else if (suit != null) { suit.LampOn = !suit.LampOn; GameEvents.PlaySound("click"); }
            }
            bool on = suit != null && suit.LampOn && (player == null || player.isActiveAndEnabled);
            level = Mathf.MoveTowards(level, on ? 1f : 0f, Time.deltaTime * 8f);
            if (spot) { spot.enabled = level > 0.01f; spot.intensity = spotIntensity * level; }
            if (fill) { fill.enabled = level > 0.01f; fill.intensity = fillIntensity * level; }
        }
    }
}
