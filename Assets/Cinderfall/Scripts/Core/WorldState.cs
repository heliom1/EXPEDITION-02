using System;
using System.Collections.Generic;

namespace Cinderfall.Core
{
    /// <summary>
    /// Persistent world/mission state expressed as string flags plus named numeric values.
    /// Every gameplay system that needs to survive save/load stores its state here,
    /// so the save system never needs to know about individual objects.
    /// </summary>
    public static class WorldState
    {
        static readonly HashSet<string> flags = new HashSet<string>();
        static readonly Dictionary<string, float> values = new Dictionary<string, float>();

        /// <summary>Raised after a flag is newly set.</summary>
        public static event Action<string> FlagSet;
        /// <summary>Raised after the whole state is replaced (new game or load).</summary>
        public static event Action StateRestored;

        public static bool Has(string flag) => !string.IsNullOrEmpty(flag) && flags.Contains(flag);

        public static void Set(string flag)
        {
            if (string.IsNullOrEmpty(flag) || !flags.Add(flag)) return;
            FlagSet?.Invoke(flag);
        }

        public static void Clear(string flag) => flags.Remove(flag);

        public static float Get(string key, float fallback = 0f) => values.TryGetValue(key, out var v) ? v : fallback;
        public static void SetValue(string key, float value) => values[key] = value;

        public static IEnumerable<string> AllFlags => flags;
        public static IEnumerable<KeyValuePair<string, float>> AllValues => values;

        public static void Reset()
        {
            flags.Clear();
            values.Clear();
        }

        public static void Restore(IEnumerable<string> savedFlags, IList<string> keys, IList<float> vals)
        {
            Reset();
            if (savedFlags != null) foreach (var f in savedFlags) if (!string.IsNullOrEmpty(f)) flags.Add(f);
            if (keys != null && vals != null)
                for (int i = 0; i < keys.Count && i < vals.Count; i++) values[keys[i]] = vals[i];
            StateRestored?.Invoke();
        }

        /// <summary>Re-broadcast restore so late-initialised objects can sync.</summary>
        public static void NotifyRestored() => StateRestored?.Invoke();
    }
}
