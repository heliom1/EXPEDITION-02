using System;
using System.Collections;
using Cinderfall.Player;
using Cinderfall.Story;
using Cinderfall.Vehicles;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Cinderfall.Core
{
    public enum GamePhase { Menu, Playing, Paused, Reading, Pda, Ending }

    /// <summary>
    /// Owns game flow: title menu (in-world backdrop), new game / continue, pause, save/load,
    /// autosave, suit-failure recovery and the end-of-content screen.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }
        public static event Action<GamePhase> PhaseChanged;

        [Header("Scene references")]
        public PlayerController player;
        public RoverController rover;
        public Transform playerSpawn;          // new game start (outpost)
        public Transform recoverySpawn;        // after suit failure
        public Transform roverStart;
        public Camera menuCamera;
        public Transform[] menuCameraShots;

        [Header("Survey area (metres from origin)")]
        public float boundarySoft = 2850f;
        public float boundaryHard = 2960f;

        public GamePhase Phase { get; private set; } = GamePhase.Menu;
        public float PlayTime { get; private set; }
        public bool HasStarted { get; private set; }

        /// <summary>Set by the boot/title flow: start directly into a game (used by tests and 'Continue').</summary>
        public static bool AutoStartNewGame, AutoContinue;

        float autosaveCooldown;
        int menuShot;
        float menuShotTime;
        bool endingShown;

        void Awake()
        {
            Instance = this;
            GameSettings.EnsureLoaded();
            GameInput.Init();
            Physics.gravity = new Vector3(0, -3.721f, 0);
            StoryDatabase.Load();
        }

        void OnEnable()
        {
            SuitSystem.SuitFailure += OnSuitFailure;
            WorldState.FlagSet += OnFlag;
        }

        void OnDisable()
        {
            SuitSystem.SuitFailure -= OnSuitFailure;
            WorldState.FlagSet -= OnFlag;
        }

        void Start()
        {
            if (AutoContinue && SaveSystem.HasSave()) { AutoContinue = false; ContinueGame(); }
            else if (AutoStartNewGame) { AutoStartNewGame = false; NewGame(); }
            else EnterMenu();
        }

        // ------------------------------------------------------------------ phases
        public void SetPhase(GamePhase p)
        {
            Phase = p;
            bool gameplay = p == GamePhase.Playing;
            Time.timeScale = p == GamePhase.Paused || p == GamePhase.Menu && HasStarted ? 0f : 1f;
            if (p == GamePhase.Menu && !HasStarted) Time.timeScale = 1f;
            Cursor.lockState = gameplay ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !gameplay;
            bool driving = rover && rover.Occupied;
            if (player)
            {
                player.SetControlEnabled(gameplay && !driving);
                var inter = player.GetComponent<Interaction.Interactor>();
                if (inter) inter.InputBlocked = !gameplay || driving;
            }
            if (rover) rover.enabled = gameplay || p == GamePhase.Pda;
            PhaseChanged?.Invoke(p);
        }

        void EnterMenu()
        {
            HasStarted = false;
            if (player) player.gameObject.SetActive(false);
            if (menuCamera) { menuCamera.gameObject.SetActive(true); menuCamera.enabled = true; }
            SetPhase(GamePhase.Menu);
        }

        void BeginPlay()
        {
            HasStarted = true;
            if (menuCamera) menuCamera.gameObject.SetActive(false);
            if (player) player.gameObject.SetActive(true);
            SetPhase(GamePhase.Playing);
        }

        public void NewGame()
        {
            WorldState.Reset();
            WorldState.SetValue("suit.o2", 1f);
            WorldState.SetValue("suit.power", 1f);
            PlayTime = 0f;
            endingShown = false;
            BeginPlay();
            if (rover && rover.Occupied) rover.TryExit();
            if (rover && roverStart) rover.Place(roverStart.position, roverStart.rotation);
            if (player && playerSpawn) player.Teleport(playerSpawn.position, playerSpawn.eulerAngles.y);
            WorldState.NotifyRestored();
            SuitSystem.Instance?.Refill();
            GameEvents.Notify("New objective: " + (ObjectiveManager.Instance?.Current?.title ?? ""), NoticeKind.Objective);
            UI.UIRoot.Instance?.ShowIntro();
        }

        public void ContinueGame()
        {
            var data = SaveSystem.Read();
            if (data == null) { GameEvents.Notify("No readable save found. Starting a new game.", NoticeKind.Warning); NewGame(); return; }
            BeginPlay();
            ApplySave(data);
        }

        public void LoadGame()
        {
            var data = SaveSystem.Read();
            if (data == null) { GameEvents.Notify("No save found.", NoticeKind.Warning); return; }
            if (!HasStarted) BeginPlay();
            ApplySave(data);
            SetPhase(GamePhase.Playing);
            GameEvents.Notify("Game loaded.", NoticeKind.Info);
        }

        void ApplySave(SaveData data)
        {
            if (rover && rover.Occupied) rover.TryExitForced();
            WorldState.Restore(data.flags, data.valueKeys, data.valueData);
            PlayTime = data.playTimeSeconds;
            endingShown = WorldState.Has("outpost.report");
            if (rover) rover.Place(data.roverPosition, data.roverRotation);
            if (player)
            {
                player.Teleport(data.playerPosition, data.playerYaw, data.playerPitch);
                if (data.playerInRover && rover) rover.ForceEnter(player);
            }
            SuitSystem.Instance?.Restore();
            SetPhase(GamePhase.Playing);
        }

        public bool SaveGame()
        {
            if (!HasStarted || player == null) return false;
            try
            {
                var d = new SaveData
                {
                    playTimeSeconds = PlayTime,
                    playerInRover = rover && rover.Occupied,
                    playerYaw = player.Yaw,
                    playerPitch = player.Pitch,
                };
                d.playerPosition = d.playerInRover ? rover.transform.position + Vector3.up * 2f : player.transform.position;
                if (d.playerInRover) d.playerPosition = player.LastSafePosition;
                if (rover) { d.roverPosition = rover.transform.position + Vector3.up * 0.3f; d.roverRotation = Quaternion.Euler(0, rover.transform.eulerAngles.y, 0); }
                SaveSystem.Write(d);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError("[Cinderfall] Save failed: " + e);
                GameEvents.Notify("Save failed: " + e.Message, NoticeKind.Critical);
                return false;
            }
        }

        public void AutoSave()
        {
            if (autosaveCooldown > 0f) return;
            autosaveCooldown = 5f;
            if (SaveGame()) GameEvents.Notify("Autosaved.", NoticeKind.Info);
        }

        // ------------------------------------------------------------------ update
        void Update()
        {
            autosaveCooldown -= Time.unscaledDeltaTime;
            if (Phase == GamePhase.Playing) PlayTime += Time.deltaTime;
            if (Phase == GamePhase.Menu) UpdateMenuCamera();
            if (Phase == GamePhase.Playing) Boundary();
            // Keep the cursor locked during play even after focus changes.
            if (Phase == GamePhase.Playing && Cursor.lockState != CursorLockMode.Locked && Application.isFocused)
            { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
        }

        void UpdateMenuCamera()
        {
            if (!menuCamera || menuCameraShots == null || menuCameraShots.Length == 0) return;
            menuShotTime += Time.unscaledDeltaTime;
            if (menuShotTime > 16f) { menuShotTime = 0f; menuShot = (menuShot + 1) % menuCameraShots.Length; }
            var s = menuCameraShots[menuShot];
            float drift = menuShotTime * 0.6f;
            menuCamera.transform.SetPositionAndRotation(s.position + s.right * drift, s.rotation * Quaternion.Euler(0, drift * 0.15f, 0));
        }

        float boundaryNoticeTimer;
        void Boundary()
        {
            Transform t = rover && rover.Occupied ? rover.transform : player ? player.transform : null;
            if (t == null) return;
            Vector3 p = t.position;
            float m = Mathf.Max(Mathf.Abs(p.x), Mathf.Abs(p.z));
            boundaryNoticeTimer -= Time.deltaTime;
            if (m > boundarySoft && boundaryNoticeTimer <= 0f)
            {
                boundaryNoticeTimer = 6f;
                GameEvents.Notify("Leaving the survey area. Turn back.", NoticeKind.Warning);
            }
            if (m > boundaryHard)
            {
                Vector3 inward = new Vector3(Mathf.Clamp(p.x, -boundaryHard + 4f, boundaryHard - 4f), p.y, Mathf.Clamp(p.z, -boundaryHard + 4f, boundaryHard - 4f));
                if (rover && rover.Occupied)
                {
                    var rb = rover.GetComponent<Rigidbody>();
                    Vector3 dir = (inward - p); dir.y = 0;
                    rb.linearVelocity = dir.normalized * 3f + Vector3.up * rb.linearVelocity.y;
                }
                else if (player)
                {
                    float y = Terrain.activeTerrain ? SampleHeight(inward) + 0.2f : p.y;
                    player.Teleport(new Vector3(inward.x, y, inward.z), player.Yaw, player.Pitch);
                }
            }
        }

        public static float SampleHeight(Vector3 p)
        {
            if (Physics.Raycast(new Vector3(p.x, 2000f, p.z), Vector3.down, out var hit, 4000f, ~0, QueryTriggerInteraction.Ignore)) return hit.point.y;
            return p.y;
        }

        // ------------------------------------------------------------------ events
        void OnSuitFailure() => StartCoroutine(SuitFailureRoutine());

        IEnumerator SuitFailureRoutine()
        {
            GameEvents.Notify("SUIT FAILURE. Emergency recovery initiated.", NoticeKind.Critical);
            UI.UIRoot.Instance?.Fade(1f, 1.5f);
            yield return new WaitForSecondsRealtime(1.8f);
            if (rover && rover.Occupied) rover.TryExitForced();
            var spawn = recoverySpawn ? recoverySpawn : playerSpawn;
            if (player && spawn) player.Teleport(spawn.position, spawn.eulerAngles.y);
            SuitSystem.Instance?.Refill();
            yield return new WaitForSecondsRealtime(0.6f);
            UI.UIRoot.Instance?.Fade(0f, 1.5f);
            GameEvents.Notify("You were recovered to the outpost. Suit restored.", NoticeKind.Warning);
        }

        void OnFlag(string f)
        {
            if (f == "outpost.report" && !endingShown)
            {
                endingShown = true;
                StartCoroutine(EndingRoutine());
            }
        }

        IEnumerator EndingRoutine()
        {
            yield return new WaitForSecondsRealtime(2.5f);
            SetPhase(GamePhase.Ending);
            UI.UIRoot.Instance?.ShowEnding();
        }

        public void ReturnToTitle()
        {
            Time.timeScale = 1f;
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        public void QuitGame()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }
    }
}
