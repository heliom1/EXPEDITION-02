using System;
using System.Collections.Generic;
using UnityEngine;

namespace Cinderfall.Story
{
    [Serializable]
    public class ObjectiveDef
    {
        public string id;
        public string title;
        public string description;
        public string completeFlag;   // WorldState flag that completes this objective
        public string marker;         // WorldMarker id shown on HUD/PDA while active
        public string onCompleteLog;  // optional log unlocked on completion
    }

    [Serializable]
    public class LogEntry
    {
        public string id;
        public string type;           // "diary", "clue", "mission", "discovery"
        public string title;
        public string author;
        public string stamp;
        [TextArea] public string body;
        public bool placeholder;      // true when the text is an OPEN STORY DECISION stand-in
    }

    [Serializable]
    public class StoryFile
    {
        public string title;
        public string setting;
        public string intro;
        public string endOfContent;
        public ObjectiveDef[] objectives;
        public LogEntry[] logs;
    }

    /// <summary>
    /// Loads Resources/Story/story.json. All narrative text lives in that file so it can be
    /// replaced by the user's authoritative story without code changes.
    /// </summary>
    public static class StoryDatabase
    {
        static StoryFile data;
        static Dictionary<string, LogEntry> logs;

        public static StoryFile Data { get { Load(); return data; } }

        public static void Load(bool force = false)
        {
            if (data != null && !force) return;
            var asset = Resources.Load<TextAsset>("Story/story");
            if (asset == null)
            {
                Debug.LogError("[Cinderfall] Resources/Story/story.json missing.");
                data = new StoryFile { objectives = new ObjectiveDef[0], logs = new LogEntry[0] };
            }
            else data = JsonUtility.FromJson<StoryFile>(asset.text);
            logs = new Dictionary<string, LogEntry>();
            foreach (var l in data.logs ?? new LogEntry[0]) logs[l.id] = l;
        }

        public static LogEntry GetLog(string id)
        {
            Load();
            return id != null && logs.TryGetValue(id, out var l) ? l : null;
        }

        public static IReadOnlyList<ObjectiveDef> Objectives { get { Load(); return data.objectives; } }
    }
}
