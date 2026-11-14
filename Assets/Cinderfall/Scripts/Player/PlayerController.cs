using System;
using Cinderfall.Core;
using UnityEngine;

namespace Cinderfall.Player
{
    /// <summary>
    /// First-person astronaut controller (CharacterController based).
    /// Mars gravity, slope limit with sliding, crouch for low passages, head bob,
    /// footstep events and fall-through recovery to the last safe position.
    /// The visual body is optional: assign the astronaut model under 'bodyRoot' later.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [Header("References")]
        public Transform head;           // pitch pivot, camera lives under it
        public Camera playerCamera;
        public Transform bodyRoot;       // placeholder / future astronaut model

        [Header("Movement (m/s)")]
        public float walkSpeed = 2.6f;
        public float runSpeed = 4.6f;
        public float crouchSpeed = 1.4f;
        public float groundAccel = 14f;
        public float airAccel = 2.2f;
        public float jumpHeight = 0.9f;
        public float gravity = 3.721f;        // Mars surface gravity
        public float slideStartAngle = 42f;

        [Header("Body")]
        public float standHeight = 1.8f;
        public float crouchHeight = 1.15f;
        public float eyeOffsetFromTop = 0.16f;

        [Header("Look")]
        public float baseSensitivity = 0.075f; // degrees per mouse count
        public float pitchLimit = 85f;

        public bool ControlEnabled { get; private set; } = true;
        public bool IsGrounded { get; private set; }
        public bool IsCrouching { get; private set; }
        public bool IsRunning { get; private set; }
        public Vector3 Velocity => velocity;
        public float Pitch => pitch;
        public float Yaw => transform.eulerAngles.y;
        public Vector3 GroundNormal { get; private set; } = Vector3.up;
        public Collider GroundCollider { get; private set; }

        /// <summary>Raised per footstep with the step intensity (0..1).</summary>
        public event Action<float> Footstep;
        public event Action<float> Landed;

        CharacterController cc;
        Vector3 velocity;
        float pitch;
        float stepDistance;
        float bobPhase;
        float airTime;
        Vector3 lastSafePosition;
        float lastSafeTimer;
        float currentHeight;

        void Awake()
        {
            cc = GetComponent<CharacterController>();
            currentHeight = standHeight;
            ApplyHeight(standHeight);
            lastSafePosition = transform.position;
            GameInput.Init();
        }

        void Start()
        {
            GameSettings.EnsureLoaded();
            if (playerCamera) playerCamera.fieldOfView = GameSettings.FieldOfView;
            GameSettings.Changed += OnSettingsChanged;
        }

        void OnDestroy() => GameSettings.Changed -= OnSettingsChanged;
        void OnSettingsChanged() { if (playerCamera) playerCamera.fieldOfView = GameSettings.FieldOfView; }

        public void SetControlEnabled(bool on)
        {
            ControlEnabled = on;
            if (!on) velocity = new Vector3(0, Mathf.Min(velocity.y, 0), 0);
        }

        /// <summary>Move instantly (save load, respawn, exiting the rover).</summary>
        public void Teleport(Vector3 position, float yaw, float newPitch = 0f)
        {
            bool was = cc.enabled;
            cc.enabled = false;
            transform.SetPositionAndRotation(position, Quaternion.Euler(0, yaw, 0));
            pitch = Mathf.Clamp(newPitch, -pitchLimit, pitchLimit);
            if (head) head.localRotation = Quaternion.Euler(pitch, 0, 0);
            velocity = Vector3.zero;
            cc.enabled = was;
            lastSafePosition = position;
            airTime = 0f;
            Physics.SyncTransforms();
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;
            if (ControlEnabled) Look();
            Move(dt);
            HeadMotion(dt);
            FallRecovery(dt);
        }

        void Look()
        {
            Vector2 d = GameInput.Look.ReadValue<Vector2>();
            float s = baseSensitivity * GameSettings.MouseSensitivity;
            transform.Rotate(0f, d.x * s, 0f, Space.Self);
            pitch = Mathf.Clamp(pitch + (GameSettings.InvertY ? d.y : -d.y) * s, -pitchLimit, pitchLimit);
            if (head) head.localRotation = Quaternion.Euler(pitch, 0, 0);
        }

        void Move(float dt)
        {
            Vector2 input = ControlEnabled ? GameInput.Move.ReadValue<Vector2>() : Vector2.zero;
            input = Vector2.ClampMagnitude(input, 1f);

            // Crouch (hold); stay crouched while the ceiling is too low to stand.
            bool wantCrouch = ControlEnabled && GameInput.Crouch.IsPressed();
            if (!wantCrouch && IsCrouching && !CanStand()) wantCrouch = true;
            IsCrouching = wantCrouch;
            float targetH = IsCrouching ? crouchHeight : standHeight;
            if (!Mathf.Approximately(currentHeight, targetH))
            {
                currentHeight = Mathf.MoveTowards(currentHeight, targetH, dt * 3f);
                ApplyHeight(currentHeight);
            }

            IsRunning = ControlEnabled && !IsCrouching && GameInput.Sprint.IsPressed() && input.y > 0.1f;
            float speed = IsCrouching ? crouchSpeed : IsRunning ? runSpeed : walkSpeed;
            Vector3 wish = (transform.forward * input.y + transform.right * input.x) * speed;

            ProbeGround();
            float slopeAngle = Vector3.Angle(GroundNormal, Vector3.up);
            bool sliding = IsGrounded && slopeAngle > slideStartAngle;

            Vector3 horiz = new Vector3(velocity.x, 0, velocity.z);
            float accel = IsGrounded && !sliding ? groundAccel : airAccel;
            horiz = Vector3.MoveTowards(horiz, wish, accel * dt);

            if (IsGrounded && !sliding)
            {
                if (velocity.y < 0f) velocity.y = -2.0f; // keep contact on downhill walking
                if (ControlEnabled && !IsCrouching && GameInput.Jump.WasPressedThisFrame())
                    velocity.y = Mathf.Sqrt(2f * gravity * jumpHeight);
            }
            else
            {
                velocity.y -= gravity * dt;
                if (sliding)
                {
                    Vector3 downhill = Vector3.ProjectOnPlane(Vector3.down, GroundNormal).normalized;
                    horiz += new Vector3(downhill.x, 0, downhill.z) * gravity * 0.6f * dt;
                }
            }
            velocity.x = horiz.x; velocity.z = horiz.z;
            velocity.y = Mathf.Max(velocity.y, -40f);

            bool wasGrounded = IsGrounded;
            float preFallSpeed = velocity.y;
            var flags = cc.Move(velocity * dt);
            if ((flags & CollisionFlags.Above) != 0 && velocity.y > 0f) velocity.y = 0f;
            IsGrounded = cc.isGrounded;
            if (IsGrounded && !wasGrounded && preFallSpeed < -2.5f) Landed?.Invoke(Mathf.InverseLerp(2.5f, 9f, -preFallSpeed));

            // Footsteps by distance travelled on the ground.
            if (IsGrounded)
            {
                float moved = new Vector2(cc.velocity.x, cc.velocity.z).magnitude * dt;
                stepDistance += moved;
                float stride = IsRunning ? 1.6f : IsCrouching ? 0.7f : 1.05f;
                if (stepDistance >= stride)
                {
                    stepDistance = 0f;
                    Footstep?.Invoke(IsRunning ? 1f : IsCrouching ? 0.35f : 0.65f);
                }
            }
        }

        void ProbeGround()
        {
            float r = cc.radius * 0.9f;
            Vector3 origin = transform.position + Vector3.up * (r + 0.05f);
            if (Physics.SphereCast(origin, r, Vector3.down, out var hit, 0.35f, ~0, QueryTriggerInteraction.Ignore))
            {
                GroundNormal = hit.normal; GroundCollider = hit.collider;
            }
            else { GroundNormal = Vector3.up; GroundCollider = null; }
        }

        bool CanStand()
        {
            float r = cc.radius * 0.95f;
            Vector3 bottom = transform.position + Vector3.up * (r + 0.05f);
            Vector3 top = transform.position + Vector3.up * (standHeight - r);
            return !Physics.CheckCapsule(bottom + Vector3.up * 0.3f, top, r, ~0, QueryTriggerInteraction.Ignore);
        }

        void ApplyHeight(float h)
        {
            cc.height = h;
            cc.center = new Vector3(0, h * 0.5f, 0);
        }

        void HeadMotion(float dt)
        {
            if (!head) return;
            float eye = currentHeight - eyeOffsetFromTop;
            Vector3 lp = new Vector3(0, eye, 0);
            float sp = new Vector2(cc.velocity.x, cc.velocity.z).magnitude;
            if (GameSettings.HeadBob && IsGrounded && sp > 0.3f)
            {
                bobPhase += dt * sp * 2.2f;
                lp.y += Mathf.Sin(bobPhase * 2f) * 0.025f * Mathf.Clamp01(sp / runSpeed + 0.3f);
                lp.x += Mathf.Cos(bobPhase) * 0.015f;
            }
            head.localPosition = Vector3.Lerp(head.localPosition, lp, 1f - Mathf.Exp(-dt * 14f));
        }

        void FallRecovery(float dt)
        {
            if (IsGrounded)
            {
                airTime = 0f;
                lastSafeTimer += dt;
                if (lastSafeTimer > 0.5f && Vector3.Angle(GroundNormal, Vector3.up) < 35f)
                {
                    lastSafeTimer = 0f;
                    lastSafePosition = transform.position;
                }
            }
            else airTime += dt;

            // Below the world, or falling far longer than any legitimate drop: recover.
            if (transform.position.y < -600f || airTime > 9f)
            {
                Debug.LogWarning("[Cinderfall] Player fell out of the world; recovering to last safe position.");
                Teleport(lastSafePosition + Vector3.up * 0.5f, Yaw, pitch);
                GameEvents.Notify("Position recovered.", NoticeKind.Warning);
            }
        }

        public Vector3 LastSafePosition => lastSafePosition;
    }
}
