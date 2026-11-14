using Cinderfall.Core;
using Cinderfall.Interaction;
using Cinderfall.Player;
using UnityEngine;

namespace Cinderfall.Vehicles
{
    /// <summary>
    /// Pressurised exploration rover. Six WheelColliders (three axles, front and rear steer),
    /// anti-roll, Mars gravity, power state tied to the recovery mission, enter/exit with a
    /// safe-exit search, chase camera, headlights and flip recovery.
    /// Works with the placeholder body now; the user's rover model can replace the visuals
    /// as long as wheel visuals are assigned to the matching WheelColliders.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class RoverController : MonoBehaviour
    {
        public static RoverController Instance { get; private set; }

        [System.Serializable]
        public class Axle
        {
            public WheelCollider left, right;
            public Transform leftVisual, rightVisual;
            public float steerFactor;     // +1 front, -0.5 rear (counter-steer), 0 middle
            public bool motor = true;
        }

        public Axle[] axles;
        public Transform centerOfMass;
        public Transform driverSeat;      // where the player 'sits' (for exit search origin)
        public Camera chaseCamera;
        public Light[] headlights;
        public AudioSource motorAudio;

        [Header("Drive")]
        public float maxMotorTorque = 1100f;
        public float maxBrakeTorque = 3200f;
        public float idleBrakeTorque = 400f;
        public float maxSteerAngle = 26f;
        public float maxSpeed = 13f;          // m/s (~47 km/h)
        public float reverseSpeed = 4f;
        public float antiRoll = 9000f;
        public string poweredFlag = "rover.powered";

        [Header("Chase camera")]
        public float camDistance = 9f;
        public float camHeight = 3.2f;
        public float camSensitivity = 0.12f;

        public bool Occupied { get; private set; }
        public int LastTransitionFrame { get; private set; } = -1;
        public PlayerController Driver => driver;
        public float Speed => rb ? rb.linearVelocity.magnitude : 0f;
        public float ForwardSpeed => rb ? Vector3.Dot(rb.linearVelocity, transform.forward) : 0f;
        public bool Powered => WorldState.Has(poweredFlag);

        Rigidbody rb;
        PlayerController driver;
        float camYaw, camPitch = 12f;
        float flippedTime;
        float throttle, steer;
        bool braking;

        void Awake()
        {
            Instance = this;
            rb = GetComponent<Rigidbody>();
            if (centerOfMass) rb.centerOfMass = centerOfMass.localPosition;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            if (chaseCamera) chaseCamera.enabled = false;
            var l = chaseCamera ? chaseCamera.GetComponent<AudioListener>() : null;
            if (l) l.enabled = false;
            GameInput.Init();
        }

        void Start() => UpdateLights();

        // ---------------------------------------------------------------- enter / exit
        public void Enter(PlayerController player)
        {
            if (Occupied || player == null || Time.frameCount == LastTransitionFrame) return;
            LastTransitionFrame = Time.frameCount;
            driver = player;
            Occupied = true;
            player.SetControlEnabled(false);
            player.GetComponent<CharacterController>().enabled = false;
            var inter = player.GetComponent<Interactor>(); if (inter) inter.InputBlocked = true;
            if (player.bodyRoot) player.bodyRoot.gameObject.SetActive(false);
            player.transform.SetParent(driverSeat ? driverSeat : transform, false);
            player.transform.localPosition = Vector3.zero;
            player.transform.localRotation = Quaternion.identity;
            SetCameras(true);
            camYaw = 0f; camPitch = 12f;
            GameEvents.PlaySound("door");
            GameEvents.Notify(Powered ? "Driving. [W/S] throttle, [A/D] steer, [SPACE] brake, [E] exit, [R] recover." : "Rover has no power.", Powered ? NoticeKind.Info : NoticeKind.Warning);
            UpdateLights();
        }

        public bool TryExit()
        {
            if (!Occupied || Time.frameCount == LastTransitionFrame) return false;
            if (Speed > 2.5f) { GameEvents.Notify("Stop the rover before exiting.", NoticeKind.Warning); return false; }
            if (!FindExitPoint(out var p)) { GameEvents.Notify("No safe place to exit here.", NoticeKind.Warning); return false; }
            var player = driver;
            LastTransitionFrame = Time.frameCount;
            Occupied = false; driver = null;
            player.transform.SetParent(null, true);
            if (player.bodyRoot) player.bodyRoot.gameObject.SetActive(true);
            float yaw = Quaternion.LookRotation(Vector3.ProjectOnPlane(transform.forward, Vector3.up)).eulerAngles.y;
            player.GetComponent<CharacterController>().enabled = true;
            player.Teleport(p, yaw);
            var inter = player.GetComponent<Interactor>(); if (inter) inter.InputBlocked = false;
            player.SetControlEnabled(true);
            SetCameras(false);
            GameEvents.PlaySound("door");
            UpdateLights();
            return true;
        }

        /// <summary>Exit without safety checks (load / suit-failure recovery). Caller repositions the player.</summary>
        public void TryExitForced()
        {
            if (!Occupied) return;
            var player = driver;
            Occupied = false; driver = null;
            LastTransitionFrame = Time.frameCount;
            if (player)
            {
                player.transform.SetParent(null, true);
                if (player.bodyRoot) player.bodyRoot.gameObject.SetActive(true);
                player.GetComponent<CharacterController>().enabled = true;
                var inter = player.GetComponent<Interactor>(); if (inter) inter.InputBlocked = false;
                player.SetControlEnabled(true);
            }
            SetCameras(false);
            UpdateLights();
        }

        /// <summary>Restore driver state after load (player saved while driving).</summary>
        public void ForceEnter(PlayerController player) { Occupied = false; LastTransitionFrame = -1; Enter(player); }

        bool FindExitPoint(out Vector3 point)
        {
            Vector3 c = transform.position;
            Vector3 r = transform.right, f = transform.forward;
            Vector3[] offsets = { -r * 2.9f, r * 2.9f, -f * 4.0f, f * 4.2f, -r * 3.6f - f * 1.5f, r * 3.6f - f * 1.5f };
            foreach (var o in offsets)
            {
                Vector3 probe = c + o + Vector3.up * 3f;
                if (!Physics.Raycast(probe, Vector3.down, out var hit, 8f, ~0, QueryTriggerInteraction.Ignore)) continue;
                if (hit.collider.attachedRigidbody == rb) continue;
                if (Vector3.Angle(hit.normal, Vector3.up) > 38f) continue;
                Vector3 feet = hit.point + Vector3.up * 0.05f;
                if (Physics.CheckCapsule(feet + Vector3.up * 0.45f, feet + Vector3.up * 1.4f, 0.38f, ~0, QueryTriggerInteraction.Ignore)) continue;
                point = feet; return true;
            }
            point = default; return false;
        }

        void SetCameras(bool rover)
        {
            if (chaseCamera)
            {
                chaseCamera.enabled = rover;
                var l = chaseCamera.GetComponent<AudioListener>(); if (l) l.enabled = rover;
            }
            if (driver != null || !rover)
            {
                var pc = FindAnyObjectByType<PlayerController>(FindObjectsInactive.Include);
                if (pc && pc.playerCamera)
                {
                    pc.playerCamera.enabled = !rover;
                    var l = pc.playerCamera.GetComponent<AudioListener>(); if (l) l.enabled = !rover;
                }
            }
        }

        // ---------------------------------------------------------------- driving
        void Update()
        {
            if (Occupied)
            {
                Vector2 mv = GameInput.Move.ReadValue<Vector2>();
                throttle = mv.y; steer = mv.x;
                braking = GameInput.Brake.IsPressed();
                if (GameInput.Interact.WasPressedThisFrame()) TryExit();
                if (GameInput.ResetVehicle.WasPressedThisFrame()) Recover();
                if (!Powered && Mathf.Abs(throttle) > 0.1f && Time.frameCount % 240 == 0)
                    GameEvents.Notify("Rover has no power. Reconnect the battery at the rear service panel.", NoticeKind.Warning);
                Vector2 look = GameInput.Look.ReadValue<Vector2>();
                camYaw += look.x * camSensitivity * GameSettings.MouseSensitivity;
                camPitch = Mathf.Clamp(camPitch - look.y * camSensitivity * GameSettings.MouseSensitivity * (GameSettings.InvertY ? -1 : 1), -5f, 60f);
            }
            else { throttle = 0; steer = 0; braking = false; }

            UpdateWheelVisuals();
            UpdateAudio();
            CheckFlipped();
        }

        void FixedUpdate()
        {
            if (axles == null) return;
            float fwd = ForwardSpeed;
            float t = Powered ? throttle : 0f;
            bool reversingIntent = t < -0.05f;
            bool brakeNow = braking || (fwd > 1f && reversingIntent) || (fwd < -1f && t > 0.05f);
            float speedLimit = reversingIntent ? reverseSpeed : maxSpeed;
            float torqueScale = Mathf.Clamp01(1f - Mathf.Abs(fwd) / speedLimit);
            float speedSteer = Mathf.Lerp(1f, 0.45f, Mathf.Clamp01(Speed / maxSpeed));

            foreach (var a in axles)
            {
                float steerAngle = steer * maxSteerAngle * a.steerFactor * speedSteer;
                float motor = a.motor && !brakeNow ? t * maxMotorTorque * torqueScale : 0f;
                float brake = brakeNow ? maxBrakeTorque : (Mathf.Abs(t) < 0.05f ? idleBrakeTorque : 0f);
                if (!Powered) brake = Mathf.Max(brake, maxBrakeTorque * 0.6f);   // dead rover: parking brake engaged
                foreach (var w in new[] { a.left, a.right })
                {
                    if (!w) continue;
                    w.steerAngle = steerAngle;
                    w.motorTorque = motor;
                    w.brakeTorque = brake;
                }
                ApplyAntiRoll(a.left, a.right);
            }
        }

        void ApplyAntiRoll(WheelCollider l, WheelCollider r)
        {
            if (!l || !r) return;
            float tl = 1f, tr = 1f;
            bool gl = l.GetGroundHit(out var hl), gr = r.GetGroundHit(out var hr);
            if (gl) tl = (-l.transform.InverseTransformPoint(hl.point).y - l.radius) / l.suspensionDistance;
            if (gr) tr = (-r.transform.InverseTransformPoint(hr.point).y - r.radius) / r.suspensionDistance;
            float force = (tl - tr) * antiRoll;
            if (gl) rb.AddForceAtPosition(l.transform.up * -force, l.transform.position);
            if (gr) rb.AddForceAtPosition(r.transform.up * force, r.transform.position);
        }

        void LateUpdate()
        {
            if (!Occupied || !chaseCamera) return;
            float yaw = transform.eulerAngles.y + camYaw;
            Quaternion rot = Quaternion.Euler(camPitch, yaw, 0);
            Vector3 pivot = transform.position + Vector3.up * camHeight * 0.6f;
            Vector3 desired = pivot - rot * Vector3.forward * camDistance + Vector3.up * camHeight * 0.4f;
            // Keep the camera out of terrain and rock.
            if (Physics.SphereCast(pivot, 0.3f, (desired - pivot).normalized, out var hit, (desired - pivot).magnitude, ~0, QueryTriggerInteraction.Ignore)
                && hit.collider.attachedRigidbody != rb)
                desired = pivot + (desired - pivot).normalized * Mathf.Max(1.5f, hit.distance - 0.2f);
            chaseCamera.transform.position = Vector3.Lerp(chaseCamera.transform.position, desired, 1f - Mathf.Exp(-Time.deltaTime * 10f));
            chaseCamera.transform.rotation = Quaternion.LookRotation(pivot + Vector3.up * 0.8f - chaseCamera.transform.position);
            if (driver && driver.playerCamera) chaseCamera.fieldOfView = GameSettings.FieldOfView + 4f;
        }

        void UpdateWheelVisuals()
        {
            if (axles == null) return;
            foreach (var a in axles)
            {
                Pose(a.left, a.leftVisual);
                Pose(a.right, a.rightVisual);
            }
        }

        static void Pose(WheelCollider w, Transform v)
        {
            if (!w || !v) return;
            w.GetWorldPose(out var p, out var q);
            v.SetPositionAndRotation(p, q);
        }

        void UpdateAudio()
        {
            if (!motorAudio) return;
            float target = Occupied && Powered ? 0.25f + 0.5f * Mathf.Clamp01(Speed / maxSpeed) + 0.2f * Mathf.Abs(throttle) : 0f;
            motorAudio.volume = Mathf.MoveTowards(motorAudio.volume, target * GameSettings.EffectsVolume, Time.deltaTime);
            motorAudio.pitch = 0.7f + 0.8f * Mathf.Clamp01(Speed / maxSpeed);
            if (motorAudio.volume > 0.001f && !motorAudio.isPlaying) motorAudio.Play();
            else if (motorAudio.volume <= 0.001f && motorAudio.isPlaying) motorAudio.Stop();
        }

        void CheckFlipped()
        {
            if (Vector3.Dot(transform.up, Vector3.up) < 0.35f && Speed < 1.5f)
            {
                flippedTime += Time.deltaTime;
                if (Occupied && flippedTime > 2f && Mathf.Repeat(flippedTime, 6f) < Time.deltaTime)
                    GameEvents.Notify("Rover overturned. Press [R] to right it.", NoticeKind.Warning);
            }
            else flippedTime = 0f;
        }

        public void Recover()
        {
            if (Speed > 3f) return;
            Vector3 p = transform.position + Vector3.up * 4f;
            if (Physics.Raycast(p + Vector3.up * 20f, Vector3.down, out var hit, 60f, ~0, QueryTriggerInteraction.Ignore) && hit.collider.attachedRigidbody != rb)
                p = hit.point + Vector3.up * 1.6f;
            float yaw = transform.eulerAngles.y;
            rb.linearVelocity = Vector3.zero; rb.angularVelocity = Vector3.zero;
            rb.position = p; rb.rotation = Quaternion.Euler(0, yaw, 0);
            transform.SetPositionAndRotation(p, Quaternion.Euler(0, yaw, 0));
            GameEvents.Notify("Rover righted.", NoticeKind.Info);
        }

        public void UpdateLights()
        {
            if (headlights == null) return;
            foreach (var l in headlights) if (l) l.enabled = Powered;
        }

        public void Place(Vector3 pos, Quaternion rot)
        {
            rb.linearVelocity = Vector3.zero; rb.angularVelocity = Vector3.zero;
            rb.position = pos; rb.rotation = rot;
            transform.SetPositionAndRotation(pos, rot);
            Physics.SyncTransforms();
        }

        void OnEnable() { WorldState.FlagSet += OnFlag; WorldState.StateRestored += UpdateLights; }
        void OnDisable() { WorldState.FlagSet -= OnFlag; WorldState.StateRestored -= UpdateLights; }
        void OnFlag(string f) { if (f == poweredFlag) UpdateLights(); }
    }
}
