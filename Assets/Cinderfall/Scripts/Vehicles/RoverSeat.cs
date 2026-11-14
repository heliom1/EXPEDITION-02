using Cinderfall.Interaction;
using Cinderfall.Player;

namespace Cinderfall.Vehicles
{
    /// <summary>Driver hatch interaction: enters the rover.</summary>
    public class RoverSeat : Interactable
    {
        public RoverController rover;

        void Reset() { prompt = "Enter rover"; singleUse = false; soundCue = ""; }

        public override string Prompt => rover != null && rover.Powered ? "Drive rover" : "Enter rover";
        public override bool IsAvailable => isActiveAndEnabled && rover != null && !rover.Occupied && UnityEngine.Time.frameCount != rover.LastTransitionFrame;

        public override void Interact(Interactor who)
        {
            var pc = who.GetComponent<PlayerController>();
            if (rover && pc) rover.Enter(pc);
        }
    }
}
