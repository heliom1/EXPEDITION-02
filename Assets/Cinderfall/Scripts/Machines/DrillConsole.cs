using Cinderfall.Core;
using Cinderfall.Interaction;

namespace Cinderfall.Machines
{
    /// <summary>Control panel for the drilling machine. Shows live state in its prompt.</summary>
    public class DrillConsole : Interactable
    {
        public DrillMachine machine;

        void Reset() { prompt = "Start drill cycle"; singleUse = false; soundCue = "click"; }

        public override string Prompt
        {
            get
            {
                if (machine == null) return "Drill console (offline)";
                switch (machine.Current)
                {
                    case DrillMachine.State.Idle: return "Start drill cycle";
                    case DrillMachine.State.Complete: return "Review core analysis";
                    default: return machine.StatusText;
                }
            }
        }

        public override bool IsAvailable => isActiveAndEnabled && machine != null;

        public override void Interact(Interactor who)
        {
            if (machine == null) return;
            if (machine.Current == DrillMachine.State.Idle)
            {
                if (!string.IsNullOrEmpty(requiresFlag) && !WorldState.Has(requiresFlag))
                {
                    GameEvents.Notify(blockedMessage, NoticeKind.Warning);
                    GameEvents.PlaySound("deny");
                    return;
                }
                GameEvents.PlaySound("click");
                machine.StartCycle();
            }
            else if (machine.Current == DrillMachine.State.Complete)
            {
                GameEvents.UnlockLog("core_analysis", true);
            }
            else GameEvents.Notify(machine.StatusText, NoticeKind.Info);
        }
    }
}
