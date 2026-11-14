using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Audio
{
    /// <summary>Assigns a procedurally generated clip to the AudioSource on this object at runtime.
    /// Optionally re-triggers it periodically (beacon blips).</summary>
    [RequireComponent(typeof(AudioSource))]
    public class SynthClip : MonoBehaviour
    {
        public string clipId = "beacon";
        public bool playOnStart;
        public float repeatEvery;     // > 0: one-shot every N seconds
        public float volume = 1f;
        AudioSource src;
        float timer;

        void Awake()
        {
            src = GetComponent<AudioSource>();
            src.clip = AudioSynth.Get(clipId);
            src.playOnAwake = false;
        }

        void Start() { if (playOnStart) { src.volume = volume * GameSettings.EffectsVolume; src.Play(); } timer = Random.value * repeatEvery; }

        void Update()
        {
            if (repeatEvery <= 0f) return;
            timer -= Time.deltaTime;
            if (timer <= 0f) { timer = repeatEvery; src.PlayOneShot(src.clip, volume * GameSettings.EffectsVolume); }
        }
    }
}
