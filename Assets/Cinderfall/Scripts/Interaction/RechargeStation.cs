using Cinderfall.Core;
using Cinderfall.Player;
using UnityEngine;

namespace Cinderfall.Interaction
{
    /// <summary>Suit service point: refills oxygen and power instantly on use.</summary>
    public class RechargeStation : Interactable
    {
        [Tooltip("Optional flag that must be set for the station to work (e.g. rover battery).")]
        public string poweredFlag;

        void Reset() { prompt = "Recharge suit"; singleUse = false; soundCue = "recharge"; }

        public override bool IsAvailable => isActiveAndEnabled;

        public override void Interact(Interactor who)
        {
            if (!string.IsNullOrEmpty(poweredFlag) && !WorldState.Has(poweredFlag))
            {
                GameEvents.Notify(blockedMessage, NoticeKind.Warning);
                GameEvents.PlaySound("deny");
                return;
            }
            SuitSystem.Instance?.Refill();
            GameEvents.Notify("Suit oxygen and power restored.", NoticeKind.Info);
            GameEvents.PlaySound("recharge");
        }
    }
}
