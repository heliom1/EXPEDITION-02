using Cinderfall.Core;
using Cinderfall.Player;
using UnityEngine;

namespace Cinderfall.Interaction
{
    /// <summary>Sets a WorldState flag when the player (on foot or in the rover) enters this trigger volume.</summary>
    [RequireComponent(typeof(Collider))]
    public class FlagTrigger : MonoBehaviour
    {
        public string flag;
        [Tooltip("Optional flag required before this trigger fires.")]
        public string requiresFlag;
        public string notice;
        public NoticeKind kind = NoticeKind.Info;
        public string unlockLog;

        void Reset() => GetComponent<Collider>().isTrigger = true;

        void OnTriggerEnter(Collider other)
        {
            if (WorldState.Has(flag)) return;
            if (!string.IsNullOrEmpty(requiresFlag) && !WorldState.Has(requiresFlag)) return;
            bool isPlayer = other.GetComponentInParent<PlayerController>() != null || other.GetComponentInParent<Vehicles.RoverController>() != null;
            if (!isPlayer) return;
            WorldState.Set(flag);
            if (!string.IsNullOrEmpty(notice)) GameEvents.Notify(notice, kind);
            if (!string.IsNullOrEmpty(unlockLog)) GameEvents.UnlockLog(unlockLog, false);
        }
    }
}
