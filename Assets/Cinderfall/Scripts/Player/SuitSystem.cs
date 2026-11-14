using System;
using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Player
{
    /// <summary>
    /// Suit oxygen and power. Generous capacities: they add tension on long excursions
    /// without interrupting exploration. Survival drain can be switched off in Settings.
    /// Values persist through WorldState ("suit.o2", "suit.power").
    /// </summary>
    public class SuitSystem : MonoBehaviour
    {
        public static SuitSystem Instance { get; private set; }

        [Tooltip("Minutes of oxygen from full while on foot.")]
        public float oxygenMinutes = 45f;
        [Tooltip("Minutes of power from full with the lamp off.")]
        public float powerMinutes = 90f;
        public float lampPowerMultiplier = 2.2f;
        public float refillPerSecond = 0.08f;

        public float Oxygen { get; private set; } = 1f;
        public float Power { get; private set; } = 1f;
        public bool Recharging => rechargeSources > 0 || inZone;
        bool inZone;
        PlayerController player;
        public bool LampOn { get; set; }

        public static event Action SuitFailure;

        int rechargeSources;
        int warnLevelO2, warnLevelPower;
        bool failed;

        void Awake() { Instance = this; }
        void OnEnable() => WorldState.StateRestored += Restore;
        void OnDisable() => WorldState.StateRestored -= Restore;

        public void Restore()
        {
            Oxygen = Mathf.Clamp01(WorldState.Get("suit.o2", 1f));
            Power = Mathf.Clamp01(WorldState.Get("suit.power", 1f));
            failed = false; warnLevelO2 = 0; warnLevelPower = 0;
        }

        public void Refill()
        {
            Oxygen = 1f; Power = 1f; failed = false; warnLevelO2 = 0; warnLevelPower = 0;
            Store();
        }

        public void AddRechargeSource(int delta) => rechargeSources = Mathf.Max(0, rechargeSources + delta);

        void Update()
        {
            float dt = Time.deltaTime;
            if (player == null) player = GetComponent<PlayerController>();
            var rover = Vehicles.RoverController.Instance;
            bool roverCharging = rover != null && rover.Occupied && rover.Powered;
            inZone = roverCharging || (player != null && player.isActiveAndEnabled && Interaction.RechargeZone.Contains(player.transform.position + Vector3.up));
            if (Recharging)
            {
                Oxygen = Mathf.MoveTowards(Oxygen, 1f, refillPerSecond * dt);
                Power = Mathf.MoveTowards(Power, 1f, refillPerSecond * dt);
                if (Oxygen > 0.35f) warnLevelO2 = 0;
                if (Power > 0.35f) warnLevelPower = 0;
            }
            else if (GameSettings.SurvivalEnabled)
            {
                Oxygen = Mathf.Max(0f, Oxygen - dt / (oxygenMinutes * 60f));
                Power = Mathf.Max(0f, Power - dt / (powerMinutes * 60f) * (LampOn ? lampPowerMultiplier : 1f));
            }
            Warn(Oxygen, ref warnLevelO2, "Oxygen");
            Warn(Power, ref warnLevelPower, "Suit power");
            if (Power <= 0f) LampOn = false;
            if (Oxygen <= 0f && !failed && GameSettings.SurvivalEnabled)
            {
                failed = true;
                SuitFailure?.Invoke();
            }
            Store();
        }

        void Warn(float v, ref int level, string what)
        {
            int target = v < 0.05f ? 3 : v < 0.15f ? 2 : v < 0.3f ? 1 : 0;
            if (target > level)
            {
                level = target;
                string msg = target == 3 ? $"{what} critical: {v:P0}" : target == 2 ? $"{what} low: {v:P0}. Return to the rover or outpost." : $"{what} at {v:P0}";
                GameEvents.Notify(msg, target >= 2 ? NoticeKind.Critical : NoticeKind.Warning);
                GameEvents.PlaySound(target >= 2 ? "alarm" : "warn");
            }
        }

        void Store()
        {
            WorldState.SetValue("suit.o2", Oxygen);
            WorldState.SetValue("suit.power", Power);
        }
    }
}
