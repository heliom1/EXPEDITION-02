using System;
using UnityEngine;

namespace Cinderfall.Core
{
    /// <summary>Player-facing options persisted in PlayerPrefs.</summary>
    public static class GameSettings
    {
        public static float MouseSensitivity = 1f;     // multiplier on base sensitivity
        public static bool InvertY;
        public static float FieldOfView = 70f;
        public static float MasterVolume = 0.9f;
        public static float EffectsVolume = 1f;
        public static float AmbienceVolume = 0.8f;
        public static int QualityLevel = -1;            // -1 = leave as project default
        public static bool SurvivalEnabled = true;      // suit oxygen/power drain
        public static bool HeadBob = true;
        public static int ResolutionIndex = -1;
        public static bool Fullscreen = true;

        public static event Action Changed;
        static bool loaded;

        public static void Load()
        {
            MouseSensitivity = PlayerPrefs.GetFloat("cf.sens", 1f);
            InvertY = PlayerPrefs.GetInt("cf.invertY", 0) == 1;
            FieldOfView = PlayerPrefs.GetFloat("cf.fov", 70f);
            MasterVolume = PlayerPrefs.GetFloat("cf.vol.master", 0.9f);
            EffectsVolume = PlayerPrefs.GetFloat("cf.vol.sfx", 1f);
            AmbienceVolume = PlayerPrefs.GetFloat("cf.vol.amb", 0.8f);
            QualityLevel = PlayerPrefs.GetInt("cf.quality", -1);
            SurvivalEnabled = PlayerPrefs.GetInt("cf.survival", 1) == 1;
            HeadBob = PlayerPrefs.GetInt("cf.headbob", 1) == 1;
            ResolutionIndex = PlayerPrefs.GetInt("cf.res", -1);
            Fullscreen = PlayerPrefs.GetInt("cf.fullscreen", 1) == 1;
            loaded = true;
        }

        public static void EnsureLoaded() { if (!loaded) { Load(); Apply(); } }

        public static void Save()
        {
            PlayerPrefs.SetFloat("cf.sens", MouseSensitivity);
            PlayerPrefs.SetInt("cf.invertY", InvertY ? 1 : 0);
            PlayerPrefs.SetFloat("cf.fov", FieldOfView);
            PlayerPrefs.SetFloat("cf.vol.master", MasterVolume);
            PlayerPrefs.SetFloat("cf.vol.sfx", EffectsVolume);
            PlayerPrefs.SetFloat("cf.vol.amb", AmbienceVolume);
            PlayerPrefs.SetInt("cf.quality", QualityLevel);
            PlayerPrefs.SetInt("cf.survival", SurvivalEnabled ? 1 : 0);
            PlayerPrefs.SetInt("cf.headbob", HeadBob ? 1 : 0);
            PlayerPrefs.SetInt("cf.res", ResolutionIndex);
            PlayerPrefs.SetInt("cf.fullscreen", Fullscreen ? 1 : 0);
            PlayerPrefs.Save();
        }

        public static void Apply()
        {
            AudioListener.volume = Mathf.Clamp01(MasterVolume);
            if (QualityLevel >= 0 && QualityLevel < QualitySettings.names.Length && QualitySettings.GetQualityLevel() != QualityLevel)
                QualitySettings.SetQualityLevel(QualityLevel, true);
            if (!Application.isEditor)
            {
                var resolutions = Screen.resolutions;
                if (ResolutionIndex >= 0 && ResolutionIndex < resolutions.Length)
                {
                    var r = resolutions[ResolutionIndex];
                    Screen.SetResolution(r.width, r.height, Fullscreen ? FullScreenMode.FullScreenWindow : FullScreenMode.Windowed);
                }
                else if (Screen.fullScreen != Fullscreen)
                {
                    Screen.fullScreenMode = Fullscreen ? FullScreenMode.FullScreenWindow : FullScreenMode.Windowed;
                }
            }
            Changed?.Invoke();
        }
    }
}
