using System;
using System.Collections.Generic;
using UnityEngine;

namespace Cinderfall.Audio
{
    /// <summary>
    /// Procedurally synthesised, original sound effects (no external assets).
    /// Mars' thin CO2 atmosphere carries little high-frequency sound, so exterior sounds are
    /// heavily low-passed; suit-internal sounds (breath, footsteps through the boots) dominate.
    /// </summary>
    public static class AudioSynth
    {
        public const int Rate = 44100;
        static readonly Dictionary<string, AudioClip> cache = new Dictionary<string, AudioClip>();

        public static AudioClip Get(string id)
        {
            if (cache.TryGetValue(id, out var c) && c != null) return c;
            c = Build(id);
            if (c != null) cache[id] = c;
            return c;
        }

        static AudioClip Build(string id)
        {
            switch (id)
            {
                case "wind": return Loop(id, 12f, WindSample(1));
                case "cave": return Loop(id, 10f, CaveSample(2));
                case "breath": return Loop(id, 7.2f, BreathSample(3));
                case "rover_motor": return Loop(id, 2f, MotorSample(4));
                case "drill_loop": return Loop(id, 3f, DrillSample(5));
                case "interact": return Tone(id, new[] { 1046f }, 0.07f, 0.25f);
                case "click": return Tone(id, new[] { 1480f }, 0.03f, 0.2f);
                case "terminal": return Tone(id, new[] { 880f, 1318f, 1760f }, 0.07f, 0.2f, true);
                case "objective": return Tone(id, new[] { 659f, 880f, 1175f }, 0.16f, 0.22f, true);
                case "discovery": return Tone(id, new[] { 523f, 784f, 1046f, 1568f }, 0.18f, 0.2f, true);
                case "deny": return Buzz(id, 180f, 0.22f, 0.25f);
                case "warn": return Tone(id, new[] { 740f, 740f }, 0.12f, 0.25f, true);
                case "alarm": return Tone(id, new[] { 990f, 660f, 990f, 660f }, 0.14f, 0.3f, true);
                case "recharge": return Sweep(id, 300f, 1400f, 0.9f, 0.2f);
                case "door": return NoiseBurst(id, 0.6f, 900f, 0.35f, 7, 0.04f, 0.5f);
                case "machine_start": return Sweep(id, 60f, 220f, 2.5f, 0.35f);
                case "machine_done": return Tone(id, new[] { 392f, 523f }, 0.25f, 0.25f, true);
                case "land": return NoiseBurst(id, 0.25f, 260f, 0.6f, 11, 0.002f, 0.18f);
                case "beacon": return Tone(id, new[] { 2093f }, 0.05f, 0.12f);
                case "drip": return Drip(id, 13);
            }
            if (id.StartsWith("step_"))
            {
                int v = int.Parse(id.Substring(5));
                bool cave = v >= 100;
                return NoiseBurst(id, 0.16f + 0.02f * (v % 4), cave ? 520f : 380f, 0.55f, 100 + v, 0.003f, 0.12f, grit: cave ? 0.4f : 0.7f);
            }
            Debug.LogWarning($"[Cinderfall] Unknown sound id '{id}'");
            return null;
        }

        // ------------------------------------------------------------------ helpers
        static AudioClip Make(string id, float[] data, bool loop = false)
        {
            var clip = AudioClip.Create(id, data.Length, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        /// <summary>Generates a seamless loop by crossfading the tail into the head.</summary>
        static AudioClip Loop(string id, float seconds, Func<int, float> gen)
        {
            int n = (int)(seconds * Rate), fade = Rate / 2;
            var raw = new float[n + fade];
            for (int i = 0; i < raw.Length; i++) raw[i] = gen(i);
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = raw[i];
            for (int i = 0; i < fade; i++)
            {
                float t = i / (float)fade;
                data[i] = raw[i] * t + raw[n + i] * (1f - t);
            }
            Normalize(data, 0.8f);
            return Make(id, data, true);
        }

        static void Normalize(float[] d, float peak)
        {
            float m = 1e-6f; foreach (var v in d) m = Mathf.Max(m, Mathf.Abs(v));
            float k = peak / m; for (int i = 0; i < d.Length; i++) d[i] *= k;
        }

        struct LowPass { public float y, a; public LowPass(float cutoff) { y = 0; a = 1f - Mathf.Exp(-2f * Mathf.PI * cutoff / Rate); } public float Run(float x) { y += a * (x - y); return y; } }

        static AudioClip Tone(string id, float[] notes, float noteLen, float vol, bool sequence = false)
        {
            int per = (int)(noteLen * Rate);
            int n = sequence ? per * notes.Length : per;
            var d = new float[n + Rate / 20];
            for (int k = 0; k < (sequence ? notes.Length : 1); k++)
            {
                for (int i = 0; i < per + Rate / 20 && k * per + i < d.Length; i++)
                {
                    float t = i / (float)Rate;
                    float env = Mathf.Min(1f, t * 200f) * Mathf.Exp(-t * 9f / noteLen * 0.5f);
                    float f = notes[k];
                    d[k * per + i] += vol * env * (Mathf.Sin(2 * Mathf.PI * f * t) * 0.8f + 0.2f * Mathf.Sin(4 * Mathf.PI * f * t));
                }
            }
            return Make(id, d);
        }

        static AudioClip Buzz(string id, float f, float len, float vol)
        {
            int n = (int)(len * Rate); var d = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate; float env = Mathf.Min(1f, t * 100f) * Mathf.Clamp01((len - t) * 30f);
                d[i] = vol * env * Mathf.Sign(Mathf.Sin(2 * Mathf.PI * f * t)) * 0.5f;
            }
            var lp = new LowPass(1200f); for (int i = 0; i < n; i++) d[i] = lp.Run(d[i]);
            return Make(id, d);
        }

        static AudioClip Sweep(string id, float f0, float f1, float len, float vol)
        {
            int n = (int)(len * Rate); var d = new float[n]; double ph = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)n; float f = Mathf.Lerp(f0, f1, t * t);
                ph += 2 * Math.PI * f / Rate;
                float env = Mathf.Min(1f, t * 20f) * Mathf.Clamp01((1f - t) * 6f);
                d[i] = vol * env * (float)(Math.Sin(ph) * 0.7 + 0.3 * Math.Sin(ph * 2.01));
            }
            return Make(id, d);
        }

        static AudioClip NoiseBurst(string id, float len, float cutoff, float vol, int seed, float attack, float decay, float grit = 0.5f)
        {
            var rng = new System.Random(seed);
            int n = (int)(len * Rate); var d = new float[n];
            var lp = new LowPass(cutoff); var lp2 = new LowPass(cutoff * 0.5f);
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float env = Mathf.Min(1f, t / Mathf.Max(attack, 1e-4f)) * Mathf.Exp(-t / decay);
                float x = (float)(rng.NextDouble() * 2 - 1);
                // granular crunch: sparse impulses
                if (rng.NextDouble() < 0.02 * grit) x *= 4f;
                d[i] = vol * env * lp2.Run(lp.Run(x)) * 3f;
            }
            return Make(id, d);
        }

        static AudioClip Drip(string id, int seed)
        {
            int n = Rate; var d = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float f = 1400f + 900f * Mathf.Exp(-t * 30f);
                d[i] = 0.3f * Mathf.Exp(-t * 18f) * Mathf.Sin(2 * Mathf.PI * f * t);
                // faint echo tail
                float te = t - 0.18f; if (te > 0) d[i] += 0.08f * Mathf.Exp(-te * 10f) * Mathf.Sin(2 * Mathf.PI * f * te);
            }
            return Make(id, d);
        }

        static Func<int, float> WindSample(int seed)
        {
            var rng = new System.Random(seed); var lp = new LowPass(160f); var lp2 = new LowPass(90f); var gust = new LowPass(0.15f);
            float brown = 0;
            return i =>
            {
                float w = (float)(rng.NextDouble() * 2 - 1);
                brown = Mathf.Clamp(brown + w * 0.02f, -1f, 1f) * 0.999f;
                float g = gust.Run((float)(rng.NextDouble() * 2 - 1) * 8f);
                float amp = 0.35f + 0.65f * Mathf.Clamp01(0.5f + g);
                return lp2.Run(lp.Run(brown * 3f + w * 0.15f)) * amp;
            };
        }

        static Func<int, float> CaveSample(int seed)
        {
            var rng = new System.Random(seed); var lp = new LowPass(70f); float brown = 0;
            return i =>
            {
                float t = i / (float)Rate;
                brown = Mathf.Clamp(brown + (float)(rng.NextDouble() * 2 - 1) * 0.01f, -1, 1) * 0.9995f;
                float hum = 0.25f * Mathf.Sin(2 * Mathf.PI * 41f * t) * (0.6f + 0.4f * Mathf.Sin(2 * Mathf.PI * 0.07f * t));
                return lp.Run(brown * 4f) + hum * 0.4f;
            };
        }

        static Func<int, float> BreathSample(int seed)
        {
            var rng = new System.Random(seed); var bp1 = new LowPass(900f); var bp2 = new LowPass(250f);
            const float cycle = 3.6f;
            return i =>
            {
                float t = (i / (float)Rate) % cycle;
                float inhale = t < 1.3f ? Mathf.Sin(t / 1.3f * Mathf.PI) : 0f;
                float exhale = t > 1.6f && t < 3.2f ? Mathf.Sin((t - 1.6f) / 1.6f * Mathf.PI) * 0.8f : 0f;
                float x = (float)(rng.NextDouble() * 2 - 1);
                float band = bp1.Run(x) - bp2.Run(x);
                return band * (inhale + exhale) * 0.9f;
            };
        }

        static Func<int, float> MotorSample(int seed)
        {
            var rng = new System.Random(seed); var lp = new LowPass(600f);
            return i =>
            {
                float t = i / (float)Rate;
                float whine = 0.35f * Mathf.Sin(2 * Mathf.PI * 220f * t) + 0.2f * Mathf.Sin(2 * Mathf.PI * 330f * t) + 0.1f * Mathf.Sin(2 * Mathf.PI * 110f * t);
                return whine * 0.6f + lp.Run((float)(rng.NextDouble() * 2 - 1)) * 0.5f;
            };
        }

        static Func<int, float> DrillSample(int seed)
        {
            var rng = new System.Random(seed); var lp = new LowPass(500f); var lp2 = new LowPass(2f);
            return i =>
            {
                float t = i / (float)Rate;
                float grind = lp.Run((float)(rng.NextDouble() * 2 - 1)) * (0.7f + 0.3f * Mathf.Sin(2 * Mathf.PI * 9f * t));
                float motor = 0.3f * Mathf.Sin(2 * Mathf.PI * 75f * t) + 0.15f * Mathf.Sin(2 * Mathf.PI * 150f * t);
                float chatter = lp2.Run((float)(rng.NextDouble() * 2 - 1) * 50f);
                return grind * (0.8f + 0.2f * chatter) + motor;
            };
        }
    }
}
