using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Interaction
{
    /// <summary>
    /// Finds the interactable the player is looking at (ray first, then a small sphere-cast
    /// to make small objects easy to target) and triggers it on the Interact action.
    /// </summary>
    public class Interactor : MonoBehaviour
    {
        public Transform viewOrigin;
        public float range = 3.2f;
        public float assistRadius = 0.25f;
        public LayerMask mask = ~0;

        public IInteractable Focused { get; private set; }
        public Component FocusedComponent { get; private set; }
        public bool InputBlocked { get; set; }

        readonly RaycastHit[] hits = new RaycastHit[8];

        void Update()
        {
            Focused = null; FocusedComponent = null;
            if (InputBlocked || viewOrigin == null) return;
            var ray = new Ray(viewOrigin.position, viewOrigin.forward);
            if (!TryFind(ray, 0f) && !TryFind(ray, assistRadius)) return;
            if (GameInput.Interact.WasPressedThisFrame() && Focused != null && Focused.IsAvailable)
                Focused.Interact(this);
        }

        bool TryFind(Ray ray, float radius)
        {
            int n = radius <= 0f
                ? Physics.RaycastNonAlloc(ray, hits, range, mask, QueryTriggerInteraction.Collide)
                : Physics.SphereCastNonAlloc(ray, radius, hits, range, mask, QueryTriggerInteraction.Collide);
            float best = float.MaxValue;
            float blocker = float.MaxValue;
            // Nearest solid, non-interactive surface blocks interaction behind it.
            for (int i = 0; i < n; i++)
            {
                var h = hits[i];
                if (h.collider.isTrigger || h.collider.transform.IsChildOf(transform)) continue;
                if (h.collider.GetComponentInParent<IInteractable>() == null && h.distance < blocker) blocker = h.distance;
            }
            for (int i = 0; i < n; i++)
            {
                var h = hits[i];
                if (h.collider.transform.IsChildOf(transform)) continue;
                var it = h.collider.GetComponentInParent<IInteractable>();
                if (it == null || !it.IsAvailable) continue;
                if (h.distance > blocker + 0.05f) continue;
                if (h.distance < best) { best = h.distance; Focused = it; FocusedComponent = (Component)it; }
            }
            return Focused != null;
        }
    }
}
