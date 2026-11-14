using System.Collections.Generic;
using UnityEngine;

namespace Cinderfall.World
{
    /// <summary>Named navigation point shown on the PDA map and HUD when its objective is active.</summary>
    public class WorldMarker : MonoBehaviour
    {
        public static readonly List<WorldMarker> All = new List<WorldMarker>();
        public string id;
        public string label;
        [Tooltip("Always visible on the PDA map (major landmark), not only when an objective uses it.")]
        public bool alwaysOnMap;
        public bool isLandmark;

        void OnEnable() { if (!All.Contains(this)) All.Add(this); }
        void OnDisable() => All.Remove(this);

        public static WorldMarker Find(string markerId)
        {
            if (string.IsNullOrEmpty(markerId)) return null;
            foreach (var m in All) if (m.id == markerId) return m;
            return null;
        }
    }
}
