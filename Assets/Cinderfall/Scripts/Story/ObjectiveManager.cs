using System;
using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Story
{
    /// <summary>
    /// Sequential mission progression driven by WorldState flags.
    /// The current objective index is derived from flags, so it is always consistent with saves.
    /// </summary>
    public class ObjectiveManager : MonoBehaviour
    {
        public static ObjectiveManager Instance { get; private set; }
        public static event Action<ObjectiveDef> ObjectiveChanged;
        public static event Action AllObjectivesComplete;

        public int CurrentIndex { get; private set; } = -1;
        public ObjectiveDef Current => CurrentIndex >= 0 && CurrentIndex < StoryDatabase.Objectives.Count ? StoryDatabase.Objectives[CurrentIndex] : null;
        public bool IsComplete => CurrentIndex >= StoryDatabase.Objectives.Count;

        void Awake() { Instance = this; StoryDatabase.Load(); }
        void OnEnable() { WorldState.FlagSet += OnFlag; WorldState.StateRestored += Recalculate; }
        void OnDisable() { WorldState.FlagSet -= OnFlag; WorldState.StateRestored -= Recalculate; }
        void Start() => Recalculate();

        /// <summary>Find the first objective whose completion flag is not yet set.</summary>
        public void Recalculate()
        {
            var list = StoryDatabase.Objectives;
            int i = 0;
            while (i < list.Count && WorldState.Has(list[i].completeFlag)) i++;
            bool changed = i != CurrentIndex;
            CurrentIndex = i;
            if (changed) ObjectiveChanged?.Invoke(Current);
        }

        void OnFlag(string flag)
        {
            var cur = Current;
            if (cur == null || flag != cur.completeFlag) return;
            GameEvents.Notify($"Objective complete: {cur.title}", NoticeKind.Objective);
            GameEvents.PlaySound("objective");
            if (!string.IsNullOrEmpty(cur.onCompleteLog)) GameEvents.UnlockLog(cur.onCompleteLog, false);
            Recalculate();
            var next = Current;
            if (next != null) GameEvents.Notify($"New objective: {next.title}", NoticeKind.Objective);
            else AllObjectivesComplete?.Invoke();
            if (GameManager.Instance != null) GameManager.Instance.AutoSave();
        }

        public bool IsActiveMarker(string markerId) => Current != null && Current.marker == markerId;
    }
}
