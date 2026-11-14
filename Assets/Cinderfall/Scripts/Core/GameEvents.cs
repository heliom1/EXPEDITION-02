using System;

namespace Cinderfall.Core
{
    public enum NoticeKind { Info, Objective, Discovery, Warning, Critical }

    /// <summary>Global, decoupled game events (UI listens, gameplay raises).</summary>
    public static class GameEvents
    {
        public static event Action<string, NoticeKind> Notice;
        public static event Action<string> LogUnlocked;      // log id
        public static event Action<string> ReadLogRequested; // log id
        public static event Action<string> Sound;            // UI/one-shot sound cue id

        public static void Notify(string text, NoticeKind kind = NoticeKind.Info) => Notice?.Invoke(text, kind);
        public static void RaiseLogUnlocked(string id) => LogUnlocked?.Invoke(id);
        public static void RequestReadLog(string id) => ReadLogRequested?.Invoke(id);
        public static void PlaySound(string cue) => Sound?.Invoke(cue);

        /// <summary>Unlocks a log entry (diary page, clue record or mission message) and announces it.</summary>
        public static void UnlockLog(string id, bool openReader)
        {
            if (string.IsNullOrEmpty(id)) return;
            string flag = "log." + id;
            if (!WorldState.Has(flag))
            {
                WorldState.Set(flag);
                var entry = Story.StoryDatabase.GetLog(id);
                RaiseLogUnlocked(id);
                if (entry != null)
                    Notify($"{(entry.type == "diary" ? "Diary entry recovered" : "Record added")}: {entry.title}", NoticeKind.Discovery);
            }
            if (openReader) RequestReadLog(id);
        }
    }
}
