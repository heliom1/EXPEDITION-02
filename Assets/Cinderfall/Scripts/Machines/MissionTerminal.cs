using Cinderfall.Core;
using Cinderfall.Interaction;
using Cinderfall.Story;

namespace Cinderfall.Machines
{
    /// <summary>
    /// Outpost mission terminal: check-in at the start, final report at the end,
    /// and a manual save point at any other time.
    /// </summary>
    public class MissionTerminal : Interactable
    {
        public string checkInFlag = "outpost.checkin";
        public string reportFlag = "outpost.report";
        public string reportRequires = "ice.sampled";

        void Reset() { prompt = "Use mission terminal"; singleUse = false; soundCue = "terminal"; }

        public override bool IsAvailable => isActiveAndEnabled;

        public override string Prompt
        {
            get
            {
                if (!WorldState.Has(checkInFlag)) return "Check in at mission terminal";
                if (WorldState.Has(reportRequires) && !WorldState.Has(reportFlag)) return "Transmit discovery report";
                return "Save progress at terminal";
            }
        }

        public override void Interact(Interactor who)
        {
            GameEvents.PlaySound("terminal");
            if (!WorldState.Has(checkInFlag))
            {
                WorldState.Set(checkInFlag);
                GameEvents.RequestReadLog("mission_brief");
                return;
            }
            if (WorldState.Has(reportRequires) && !WorldState.Has(reportFlag))
            {
                WorldState.Set(reportFlag);
                GameEvents.Notify("Discovery report transmitted to Earth.", NoticeKind.Discovery);
                return;
            }
            if (GameManager.Instance != null && GameManager.Instance.SaveGame())
                GameEvents.Notify("Progress saved.", NoticeKind.Info);
        }
    }
}
