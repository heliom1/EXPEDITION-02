using System.Collections.Generic;
using UnityEngine;

namespace Cinderfall.Interaction
{
    /// <summary>
    /// Slowly recharges the suit while the player stands inside (e.g. beside the outpost).
    /// Polled by SuitSystem using the player position, so it is robust to colliders being disabled.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class RechargeZone : MonoBehaviour
    {
        static readonly List<RechargeZone> zones = new List<RechargeZone>();
        Collider col;

        void Awake() { col = GetComponent<Collider>(); col.isTrigger = true; }
        void OnEnable() => zones.Add(this);
        void OnDisable() => zones.Remove(this);

        public static bool Contains(Vector3 p)
        {
            foreach (var z in zones)
                if (z.col != null && (z.col.ClosestPoint(p) - p).sqrMagnitude < 0.0001f) return true;
            return false;
        }
    }
}
