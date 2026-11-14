using Cinderfall.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace Cinderfall.UI
{
    /// <summary>
    /// Builds the whole UI at runtime and routes UI-level input (PDA toggle, Escape handling,
    /// log reader) according to the current GamePhase.
    /// </summary>
    public class UIRoot : MonoBehaviour
    {
        public static UIRoot Instance { get; private set; }

        HudView hud;
        PdaView pda;
        LogReaderView reader;
        MenuViews menus;
        Image fader;
        float fadeTarget, fadeSpeed = 1f;
        GamePhase readerReturnPhase = GamePhase.Playing;
        bool introPending;

        void Awake()
        {
            Instance = this;
            var canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            var root = (RectTransform)canvasGo.transform;

            if (FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                es.transform.SetParent(transform, false);
            }

            hud = new HudView(root);
            pda = new PdaView(root);
            reader = new LogReaderView(root, CloseReader);
            menus = new MenuViews(root);
            fader = UIFactory.Image("Fader", root, Color.black, false);
            fader.rectTransform.Fill();
            fader.color = new Color(0, 0, 0, 1);
            fadeTarget = 0f; fadeSpeed = 0.7f;
            pda.Root.gameObject.SetActive(false);
            reader.Root.gameObject.SetActive(false);
        }

        void OnEnable()
        {
            GameManager.PhaseChanged += OnPhase;
            GameEvents.Notice += OnNotice;
            GameEvents.ReadLogRequested += OpenLog;
        }

        void OnDisable()
        {
            GameManager.PhaseChanged -= OnPhase;
            GameEvents.Notice -= OnNotice;
            GameEvents.ReadLogRequested -= OpenLog;
        }

        void OnNotice(string text, NoticeKind kind) => hud.AddNotice(text, kind);

        void OnPhase(GamePhase p)
        {
            hud.Root.gameObject.SetActive(p == GamePhase.Playing || p == GamePhase.Reading && !menus.Intro.gameObject.activeSelf);
            pda.Root.gameObject.SetActive(p == GamePhase.Pda);
            if (p != GamePhase.Reading) reader.Root.gameObject.SetActive(false);
            switch (p)
            {
                case GamePhase.Menu: menus.Show(menus.Title); break;
                case GamePhase.Paused: menus.Show(menus.Pause); break;
                case GamePhase.Ending: menus.ShowEnding(); break;
                case GamePhase.Reading: if (!menus.Intro.gameObject.activeSelf) menus.HideAll(); break;
                default: menus.HideAll(); break;
            }
            if (p == GamePhase.Pda) pda.OnOpen();
        }

        public void ShowIntro()
        {
            var gm = GameManager.Instance;
            if (gm == null) return;
            menus.ShowIntro();
            gm.SetPhase(GamePhase.Reading);
            menus.Show(menus.Intro);
            hud.Root.gameObject.SetActive(false);
            introPending = true;
        }

        public void ShowEnding() => menus.ShowEnding();

        void OpenLog(string id)
        {
            var gm = GameManager.Instance;
            if (gm == null) return;
            if (gm.Phase == GamePhase.Pda) { pda.OpenLogPage(id); return; }
            if (gm.Phase != GamePhase.Playing && gm.Phase != GamePhase.Reading) return;
            if (gm.Phase == GamePhase.Playing) readerReturnPhase = GamePhase.Playing;
            reader.Show(id);
            gm.SetPhase(GamePhase.Reading);
            reader.Root.gameObject.SetActive(true);
            GameEvents.PlaySound("terminal");
        }

        void CloseReader()
        {
            reader.Root.gameObject.SetActive(false);
            GameManager.Instance?.SetPhase(readerReturnPhase);
        }

        public void Fade(float target, float seconds)
        {
            fadeTarget = target;
            fadeSpeed = 1f / Mathf.Max(0.01f, seconds);
        }

        void Update()
        {
            var gm = GameManager.Instance;
            float a = Mathf.MoveTowards(fader.color.a, fadeTarget, Time.unscaledDeltaTime * fadeSpeed);
            fader.color = new Color(0, 0, 0, a);
            fader.raycastTarget = a > 0.5f;
            if (gm == null) return;

            bool esc = GameInput.Pause.WasPressedThisFrame() && !menus.Rebinding;
            bool tab = GameInput.Pda.WasPressedThisFrame();
            bool interact = GameInput.Interact.WasPressedThisFrame();

            switch (gm.Phase)
            {
                case GamePhase.Playing:
                    if (esc) gm.SetPhase(GamePhase.Paused);
                    else if (tab) gm.SetPhase(GamePhase.Pda);
                    break;
                case GamePhase.Pda:
                    if (esc || tab) gm.SetPhase(GamePhase.Playing);
                    break;
                case GamePhase.Reading:
                    if (introPending)
                    {
                        if (esc || interact || UnityEngine.InputSystem.Keyboard.current?.spaceKey.wasPressedThisFrame == true || UnityEngine.InputSystem.Keyboard.current?.enterKey.wasPressedThisFrame == true)
                        { introPending = false; menus.HideAll(); gm.SetPhase(GamePhase.Playing); }
                    }
                    else if (esc || tab || interact) CloseReader();
                    break;
                case GamePhase.Paused:
                    if (esc) { if (menus.InSubMenu) menus.Back(); else gm.SetPhase(GamePhase.Playing); }
                    break;
                case GamePhase.Menu:
                    if (esc && menus.InSubMenu) menus.Back();
                    break;
            }
            if (gm.Phase != GamePhase.Reading) introPending = false;

            if (hud.Root.gameObject.activeInHierarchy) hud.Update();
            pda.Update();
        }
    }
}
