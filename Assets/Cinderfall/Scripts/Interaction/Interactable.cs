using Cinderfall.Core;
using UnityEngine;
using UnityEngine.Events;

namespace Cinderfall.Interaction
{
    public interface IInteractable
    {
        /// <summary>Text shown next to the interact key, e.g. "Read diary".</summary>
        string Prompt { get; }
        /// <summary>False hides the prompt entirely (object not interactive right now).</summary>
        bool IsAvailable { get; }
        void Interact(Interactor who);
    }

    /// <summary>
    /// Data-driven interactable: covers inspection, pickups, panels and switches without bespoke code.
    /// Configure requirements, effects (flags, logs, notices, sounds) and repeat behaviour in the inspector.
    /// </summary>
    public class Interactable : MonoBehaviour, IInteractable
    {
        [Tooltip("Unique id; used for the 'used' flag (interact.<id>) persisted in saves.")]
        public string id;
        public string prompt = "Inspect";
        [Tooltip("Prompt shown after the object has been used (if repeatable). Empty = same prompt.")]
        public string usedPrompt;

        [Header("Requirements")]
        [Tooltip("Flag that must be set before the interaction succeeds. Empty = none.")]
        public string requiresFlag;
        [Tooltip("Shown when the requirement is not met (clear failure state).")]
        public string blockedMessage = "Not available yet.";
        [Tooltip("Hide the prompt entirely until requiresFlag is set.")]
        public bool hiddenUntilRequirement;

        [Header("Effects")]
        public string[] setFlags;
        [Tooltip("Log entry unlocked (diary, clue or record).")]
        public string unlockLog;
        public bool openLogReader = true;
        public string notice;
        public NoticeKind noticeKind = NoticeKind.Info;
        public string soundCue = "interact";
        public UnityEvent onInteract;

        [Header("Repeat")]
        public bool singleUse = true;
        [Tooltip("Deactivate this GameObject after use (e.g. picked-up item).")]
        public bool disableAfterUse;

        public string UsedFlag => "interact." + id;
        public bool Used => WorldState.Has(UsedFlag);

        public virtual string Prompt => Used && !string.IsNullOrEmpty(usedPrompt) ? usedPrompt : prompt;

        public virtual bool IsAvailable
        {
            get
            {
                if (singleUse && Used && string.IsNullOrEmpty(usedPrompt)) return false;
                if (hiddenUntilRequirement && !string.IsNullOrEmpty(requiresFlag) && !WorldState.Has(requiresFlag)) return false;
                return isActiveAndEnabled;
            }
        }

        protected virtual void OnEnable() { WorldState.StateRestored += SyncFromState; SyncFromState(); }
        protected virtual void OnDisable() { WorldState.StateRestored -= SyncFromState; }

        protected virtual void SyncFromState()
        {
            if (disableAfterUse && Used && gameObject.activeSelf) gameObject.SetActive(false);
        }

        public virtual void Interact(Interactor who)
        {
            if (!string.IsNullOrEmpty(requiresFlag) && !WorldState.Has(requiresFlag))
            {
                GameEvents.Notify(blockedMessage, NoticeKind.Warning);
                GameEvents.PlaySound("deny");
                return;
            }
            bool firstUse = !Used;
            if (!firstUse && singleUse)
            {
                // Re-reading a used log is always allowed.
                if (!string.IsNullOrEmpty(unlockLog)) GameEvents.RequestReadLog(unlockLog);
                return;
            }
            if (!string.IsNullOrEmpty(id)) WorldState.Set(UsedFlag);
            if (setFlags != null) foreach (var f in setFlags) WorldState.Set(f);
            if (!string.IsNullOrEmpty(soundCue)) GameEvents.PlaySound(soundCue);
            if (!string.IsNullOrEmpty(notice) && firstUse) GameEvents.Notify(notice, noticeKind);
            if (!string.IsNullOrEmpty(unlockLog)) GameEvents.UnlockLog(unlockLog, openLogReader);
            onInteract?.Invoke();
            OnUsed(who, firstUse);
            if (disableAfterUse) gameObject.SetActive(false);
        }

        protected virtual void OnUsed(Interactor who, bool firstUse) { }
    }
}
