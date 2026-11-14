using Cinderfall.Core;
using Cinderfall.Player;
using Cinderfall.Vehicles;
using Cinderfall.World;
using UnityEngine;

namespace Cinderfall.Audio
{
    /// <summary>
    /// Ambience (surface wind / cave room tone, crossfaded by cave depth), suit breathing,
    /// footsteps, landing thuds, cave drips and UI/one-shot cues. Volumes follow GameSettings.
    /// </summary>
    public class AudioManager : MonoBehaviour
    {
        public static AudioManager Instance { get; private set; }

        AudioSource wind, cave, breath, ui, steps;
        PlayerController player;
        float dripTimer = 4f;
        int stepIndex;

        void Awake()
        {
            Instance = this;
            wind = MakeSource("Ambience_Wind", true, AudioSynth.Get("wind"));
            cave = MakeSource("Ambience_Cave", true, AudioSynth.Get("cave"));
            breath = MakeSource("Suit_Breath", true, AudioSynth.Get("breath"));
            ui = MakeSource("UI", false, null);
            steps = MakeSource("Footsteps", false, null);
            wind.Play(); cave.Play(); breath.Play();
            cave.volume = 0f;
        }

        AudioSource MakeSource(string n, bool loop, AudioClip clip)
        {
            var go = new GameObject(n); go.transform.SetParent(transform, false);
            var s = go.AddComponent<AudioSource>();
            s.loop = loop; s.clip = clip; s.playOnAwake = false; s.spatialBlend = 0f;
            return s;
        }

        void OnEnable() => GameEvents.Sound += PlayCue;
        void OnDisable()
        {
            GameEvents.Sound -= PlayCue;
            if (player) { player.Footstep -= OnStep; player.Landed -= OnLand; }
        }

        void Update()
        {
            if (player == null)
            {
                player = FindAnyObjectByType<PlayerController>();
                if (player) { player.Footstep += OnStep; player.Landed += OnLand; }
            }
            float dark = CaveAtmosphere.Instance ? CaveAtmosphere.Instance.Darkness : 0f;
            bool inRover = RoverController.Instance && RoverController.Instance.Occupied;
            float amb = GameSettings.AmbienceVolume;
            float paused = Time.timeScale < 0.01f ? 0.35f : 1f;
            wind.volume = Mathf.Lerp(0.32f, 0.02f, dark) * amb * (inRover ? 0.45f : 1f) * paused;
            wind.pitch = 0.9f + 0.1f * Mathf.PerlinNoise(Time.unscaledTime * 0.05f, 0.2f);
            cave.volume = Mathf.Lerp(0f, 0.38f, dark) * amb * paused;
            bool onFoot = player && player.isActiveAndEnabled && player.ControlEnabled;
            float exertion = onFoot && player.IsRunning ? 1.35f : 1f;
            breath.volume = (onFoot || inRover ? 0.09f : 0.05f) * GameSettings.EffectsVolume * paused;
            breath.pitch = Mathf.MoveTowards(breath.pitch, exertion, Time.deltaTime * 0.2f);

            if (dark > 0.4f && Time.timeScale > 0f)
            {
                dripTimer -= Time.deltaTime;
                if (dripTimer <= 0f)
                {
                    dripTimer = Random.Range(3f, 9f);
                    var cam = Camera.main;
                    if (cam)
                    {
                        Vector3 p = cam.transform.position + Random.onUnitSphere * Random.Range(4f, 14f);
                        AudioSource.PlayClipAtPoint(AudioSynth.Get("drip"), p, 0.5f * GameSettings.EffectsVolume * dark);
                    }
                }
            }
        }

        void OnStep(float intensity)
        {
            bool inCave = CaveAtmosphere.Instance && CaveAtmosphere.Instance.PlayerInside;
            stepIndex = (stepIndex + 1 + Random.Range(0, 2)) % 4;
            var clip = AudioSynth.Get("step_" + (stepIndex + (inCave ? 100 : 0)));
            steps.pitch = Random.Range(0.9f, 1.1f);
            steps.PlayOneShot(clip, (0.35f + 0.45f * intensity) * GameSettings.EffectsVolume);
        }

        void OnLand(float intensity) => steps.PlayOneShot(AudioSynth.Get("land"), (0.4f + 0.6f * intensity) * GameSettings.EffectsVolume);

        public void PlayCue(string id)
        {
            var clip = AudioSynth.Get(id);
            if (clip) ui.PlayOneShot(clip, 0.8f * GameSettings.EffectsVolume);
        }
    }
}
