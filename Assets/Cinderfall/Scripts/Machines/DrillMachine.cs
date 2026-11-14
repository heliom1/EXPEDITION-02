using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Machines
{
    /// <summary>
    /// Core-drilling machine state machine: Idle -> SpinUp -> Drilling -> Retracting -> Complete.
    /// Provides clear status feedback (status light, dust, audio, telemetry text).
    /// The bit motion is a PLACEHOLDER HOOK: 'bitPivot' is moved/rotated generically until the
    /// user's drilling-machine model supplies its own animation.
    /// </summary>
    public class DrillMachine : MonoBehaviour
    {
        public enum State { Idle, SpinUp, Drilling, Retracting, Complete }

        public static DrillMachine Instance { get; private set; }

        public string completeFlag = "drill.complete";
        public float spinUpSeconds = 3f;
        public float drillSeconds = 18f;
        public float retractSeconds = 3f;
        public float targetDepth = 3.1f;

        [Header("Feedback hooks")]
        public Transform bitPivot;
        public float bitTravel = 1.2f;
        public Light statusLight;
        public Renderer statusLamp;
        public ParticleSystem dust;
        public AudioSource loopAudio;

        public State Current { get; private set; } = State.Idle;
        public float Depth { get; private set; }
        public float Torque { get; private set; }

        float timer;
        Vector3 bitStart;
        MaterialPropertyBlock mpb;

        void Awake()
        {
            Instance = this;
            if (bitPivot) bitStart = bitPivot.localPosition;
            mpb = new MaterialPropertyBlock();
        }

        void OnEnable() => WorldState.StateRestored += Sync;
        void OnDisable() => WorldState.StateRestored -= Sync;
        void Start() => Sync();

        void Sync()
        {
            if (WorldState.Has(completeFlag)) { Current = State.Complete; Depth = targetDepth; }
            else if (Current == State.Complete) { Current = State.Idle; Depth = 0; }
            ApplyFeedback(true);
        }

        public bool CanStart => Current == State.Idle;

        public void StartCycle()
        {
            if (!CanStart) return;
            Current = State.SpinUp; timer = 0f; Depth = 0f;
            GameEvents.Notify("Drill cycle started. Spin-up in progress.", NoticeKind.Info);
            GameEvents.PlaySound("machine_start");
        }

        public string StatusText
        {
            get
            {
                switch (Current)
                {
                    case State.Idle: return "DRL-2  IDLE";
                    case State.SpinUp: return $"DRL-2  SPIN-UP {timer / spinUpSeconds:P0}";
                    case State.Drilling: return $"DRL-2  DRILLING  depth {Depth:0.00} m  torque {Torque:0} N·m";
                    case State.Retracting: return "DRL-2  RETRACTING CORE";
                    default: return "DRL-2  CORE RECOVERED";
                }
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            switch (Current)
            {
                case State.SpinUp:
                    timer += dt;
                    if (timer >= spinUpSeconds) { Current = State.Drilling; timer = 0f; }
                    break;
                case State.Drilling:
                    timer += dt;
                    Depth = Mathf.Lerp(0f, targetDepth, timer / drillSeconds);
                    float spike = Mathf.Exp(-Mathf.Pow((Depth - targetDepth * 0.97f) / 0.08f, 2f));
                    Torque = 380f + 60f * Mathf.PerlinNoise(Time.time * 3f, 0.3f) + 900f * spike;
                    if (timer >= drillSeconds) { Current = State.Retracting; timer = 0f; GameEvents.Notify("Torque spike at 3.1 m. Retracting core.", NoticeKind.Warning); }
                    break;
                case State.Retracting:
                    timer += dt;
                    if (timer >= retractSeconds)
                    {
                        Current = State.Complete;
                        GameEvents.PlaySound("machine_done");
                        WorldState.Set(completeFlag);
                    }
                    break;
            }
            ApplyFeedback(false);
        }

        void ApplyFeedback(bool immediate)
        {
            bool running = Current == State.SpinUp || Current == State.Drilling || Current == State.Retracting;
            Color c = Current == State.Complete ? new Color(0.3f, 1f, 0.45f) : running ? new Color(1f, 0.62f, 0.15f) : new Color(1f, 0.2f, 0.12f);
            float blink = running ? (Mathf.Repeat(Time.time, 1f) < 0.5f ? 1f : 0.35f) : 1f;
            if (statusLight) { statusLight.color = c; statusLight.intensity = 1.6f * blink; }
            if (statusLamp)
            {
                statusLamp.GetPropertyBlock(mpb);
                mpb.SetColor("_EmissionColor", c * 3f * blink);
                mpb.SetColor("_BaseColor", c);
                statusLamp.SetPropertyBlock(mpb);
            }
            if (dust)
            {
                if (Current == State.Drilling && !dust.isPlaying) dust.Play();
                else if (Current != State.Drilling && dust.isPlaying) dust.Stop();
            }
            if (loopAudio)
            {
                float target = running ? (Current == State.Drilling ? 0.8f : 0.45f) * GameSettings.EffectsVolume : 0f;
                loopAudio.volume = immediate ? target : Mathf.MoveTowards(loopAudio.volume, target, Time.deltaTime * 0.8f);
                loopAudio.pitch = Current == State.Drilling ? 0.9f + Torque / 4000f : 0.8f;
                if (loopAudio.volume > 0.001f && !loopAudio.isPlaying) loopAudio.Play();
                if (loopAudio.volume <= 0.001f && loopAudio.isPlaying) loopAudio.Stop();
            }
            if (bitPivot)
            {
                float travel = Current == State.Drilling ? Depth / targetDepth : Current == State.Retracting ? 1f - timer / retractSeconds : 0f;
                bitPivot.localPosition = bitStart + Vector3.down * bitTravel * travel;
                if (running) bitPivot.Rotate(0f, Time.deltaTime * (Current == State.SpinUp ? 200f * timer : 540f), 0f, Space.Self);
            }
        }
    }
}
