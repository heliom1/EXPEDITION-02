using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace Cinderfall.Core
{
    [Serializable]
    public class SaveData
    {
        public int version = SaveSystem.CurrentVersion;
        public string savedAtUtc;
        public float playTimeSeconds;

        public Vector3 playerPosition;
        public float playerYaw;
        public float playerPitch;
        public bool playerInRover;
        public bool playerInCave;

        public Vector3 roverPosition;
        public Quaternion roverRotation = Quaternion.identity;

        public List<string> flags = new List<string>();
        public List<string> valueKeys = new List<string>();
        public List<float> valueData = new List<float>();
    }

    /// <summary>JSON save files in Application.persistentDataPath, written atomically.</summary>
    public static class SaveSystem
    {
        public const int CurrentVersion = 1;
        public static string Directory => Path.Combine(Application.persistentDataPath, "Saves");
        public static string PathFor(int slot) => Path.Combine(Directory, $"cinderfall_slot{slot}.json");

        public static bool HasSave(int slot = 0) => File.Exists(PathFor(slot));

        public static void Write(SaveData data, int slot = 0)
        {
            System.IO.Directory.CreateDirectory(Directory);
            data.version = CurrentVersion;
            data.savedAtUtc = DateTime.UtcNow.ToString("o");
            data.flags = WorldState.AllFlags.ToList();
            data.valueKeys = WorldState.AllValues.Select(kv => kv.Key).ToList();
            data.valueData = WorldState.AllValues.Select(kv => kv.Value).ToList();
            string json = JsonUtility.ToJson(data, true);
            string path = PathFor(slot), tmp = path + ".tmp";
            File.WriteAllText(tmp, json);
            if (File.Exists(path)) File.Replace(tmp, path, path + ".bak");
            else File.Move(tmp, path);
        }

        public static SaveData Read(int slot = 0)
        {
            string path = PathFor(slot);
            if (!File.Exists(path)) return null;
            try
            {
                var data = JsonUtility.FromJson<SaveData>(File.ReadAllText(path));
                if (data == null || data.version > CurrentVersion) return null;
                return data;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Cinderfall] Save file unreadable ({e.Message}); trying backup.");
                string bak = path + ".bak";
                if (File.Exists(bak))
                {
                    try { return JsonUtility.FromJson<SaveData>(File.ReadAllText(bak)); } catch { }
                }
                return null;
            }
        }

        public static void Delete(int slot = 0)
        {
            string path = PathFor(slot);
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
