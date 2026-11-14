using System.Collections.Generic;
using Cinderfall.Core;
using Cinderfall.Story;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace Cinderfall.UI
{
    /// <summary>Title, pause, settings, controls, intro and ending screens.</summary>
    public class MenuViews
    {
        public readonly RectTransform Title, Pause, Settings, Controls, Intro, Ending;
        readonly Button continueButton;
        readonly Text introText, endingText, controlsStatus;
        readonly List<(InputAction action, Text label)> bindRows = new List<(InputAction, Text)>();
        System.Action settingsBack;
        InputActionRebindingExtensions.RebindingOperation rebind;
        Text qualityLabel, resolutionLabel;

        public MenuViews(RectTransform parent)
        {
            // ---------------- title
            Title = UIFactory.Rect("Title", parent).Fill();
            var grad = UIFactory.Image("Shade", Title, new Color(0, 0, 0, 0.45f)); grad.rectTransform.Place(Vector2.zero, new Vector2(0.45f, 1), Vector2.zero, Vector2.zero);
            var t = UIFactory.Text("Name", Title, "CINDERFALL 2", 92, UIFactory.TextMain, TextAnchor.LowerLeft, FontStyle.Bold);
            t.rectTransform.At(new Vector2(0, 0.5f), new Vector2(0, 0), new Vector2(110, 170), new Vector2(1000, 120));
            var sub = UIFactory.Text("Sub", Title, "MARS, 2043", 26, UIFactory.Accent, TextAnchor.UpperLeft, FontStyle.Bold);
            sub.rectTransform.At(new Vector2(0, 0.5f), new Vector2(0, 1), new Vector2(116, 166), new Vector2(800, 40));
            var col = UIFactory.Rect("Buttons", Title).At(new Vector2(0, 0.5f), new Vector2(0, 1), new Vector2(110, 90), new Vector2(360, 330));
            UIFactory.VerticalLayout(col.gameObject, 12, 0);
            continueButton = UIFactory.Button("Continue", col, "Continue", () => GameManager.Instance.ContinueGame(), 24);
            UIFactory.Layout(continueButton, 54);
            UIFactory.Layout(UIFactory.Button("New", col, "New Expedition", () => GameManager.Instance.NewGame(), 24), 54);
            UIFactory.Layout(UIFactory.Button("Settings", col, "Settings", () => OpenSettings(() => Show(Title)), 24), 54);
            UIFactory.Layout(UIFactory.Button("Quit", col, "Quit", () => GameManager.Instance.QuitGame(), 24), 54);
            var ver = UIFactory.Text("Version", Title, $"Development build {Application.version}  ·  placeholder art and story beats are labelled in-game", 14, UIFactory.TextDim, TextAnchor.LowerLeft);
            ver.rectTransform.At(Vector2.zero, Vector2.zero, new Vector2(24, 16), new Vector2(1200, 24));

            // ---------------- pause
            Pause = Modal(parent, "Pause", "PAUSED", out var pauseBody, 460, 520);
            UIFactory.VerticalLayout(pauseBody.gameObject, 12, 10);
            UIFactory.Layout(UIFactory.Button("Resume", pauseBody, "Resume", () => GameManager.Instance.SetPhase(GamePhase.Playing)), 52);
            UIFactory.Layout(UIFactory.Button("Save", pauseBody, "Save Game", () => { if (GameManager.Instance.SaveGame()) GameEvents.Notify("Progress saved.", NoticeKind.Info); }), 52);
            UIFactory.Layout(UIFactory.Button("Load", pauseBody, "Load Last Save", () => GameManager.Instance.LoadGame()), 52);
            UIFactory.Layout(UIFactory.Button("Settings", pauseBody, "Settings", () => OpenSettings(() => Show(Pause))), 52);
            UIFactory.Layout(UIFactory.Button("Title", pauseBody, "Return to Title", () => GameManager.Instance.ReturnToTitle()), 52);
            UIFactory.Layout(UIFactory.Button("QuitDesk", pauseBody, "Quit to Desktop", () => GameManager.Instance.QuitGame()), 52);

            // ---------------- settings
            Settings = Modal(parent, "Settings", "SETTINGS", out var sBody, 760, 820);
            UIFactory.VerticalLayout(sBody.gameObject, 8, 10);
            SliderRow(sBody, "Mouse sensitivity", 0.2f, 3f, GameSettings.MouseSensitivity, v => GameSettings.MouseSensitivity = v, "0.00x");
            SliderRow(sBody, "Field of view", 55f, 95f, GameSettings.FieldOfView, v => GameSettings.FieldOfView = Mathf.Round(v), "0°");
            SliderRow(sBody, "Master volume", 0f, 1f, GameSettings.MasterVolume, v => GameSettings.MasterVolume = v, "P0");
            SliderRow(sBody, "Effects volume", 0f, 1f, GameSettings.EffectsVolume, v => GameSettings.EffectsVolume = v, "P0");
            SliderRow(sBody, "Ambience volume", 0f, 1f, GameSettings.AmbienceVolume, v => GameSettings.AmbienceVolume = v, "P0");
            ToggleRow(sBody, "Invert mouse Y", () => GameSettings.InvertY, v => GameSettings.InvertY = v);
            ToggleRow(sBody, "Head bob", () => GameSettings.HeadBob, v => GameSettings.HeadBob = v);
            ToggleRow(sBody, "Survival systems (oxygen / power drain)", () => GameSettings.SurvivalEnabled, v => GameSettings.SurvivalEnabled = v);
            ToggleRow(sBody, "Fullscreen", () => GameSettings.Fullscreen, v => GameSettings.Fullscreen = v);
            qualityLabel = CycleRow(sBody, "Graphics quality", () => CycleQuality(-1), () => CycleQuality(1));
            resolutionLabel = CycleRow(sBody, "Resolution", () => CycleResolution(-1), () => CycleResolution(1));
            UIFactory.Layout(UIFactory.Button("Controls", sBody, "Controls…", () => Show(Controls)), 48);
            UIFactory.Layout(UIFactory.Button("Back", sBody, "Apply & Back", () => { GameSettings.Save(); GameSettings.Apply(); settingsBack?.Invoke(); }), 48);
            RefreshCycleLabels();

            // ---------------- controls
            Controls = Modal(parent, "Controls", "CONTROLS", out var cBody, 760, 760);
            UIFactory.VerticalLayout(cBody.gameObject, 8, 10);
            var fixedTxt = UIFactory.Text("Fixed", cBody, "Move: W A S D / arrows   ·   Look: mouse   ·   Pause: ESC\nRover: W/S throttle, A/D steer", 17, UIFactory.TextDim);
            UIFactory.Layout(fixedTxt, 52);
            foreach (var a in GameInput.Rebindable)
            {
                var row = UIFactory.Rect("Row_" + a.name, cBody);
                UIFactory.Layout(row, 46);
                var name = UIFactory.Text("Name", row, Pretty(a.name), 20, UIFactory.TextMain, TextAnchor.MiddleLeft);
                name.rectTransform.Place(Vector2.zero, new Vector2(0.5f, 1), Vector2.zero, Vector2.zero);
                var action = a;
                var b = UIFactory.Button("Bind", row, GameInput.Display(a), null, 20);
                ((RectTransform)b.transform).Place(new Vector2(0.55f, 0), Vector2.one, Vector2.zero, Vector2.zero);
                var label = b.GetComponentInChildren<Text>();
                b.onClick.AddListener(() => StartRebind(action, label));
                bindRows.Add((a, label));
            }
            controlsStatus = UIFactory.Text("Status", cBody, "Click a binding, then press the new key.", 16, UIFactory.TextDim);
            UIFactory.Layout(controlsStatus, 28);
            UIFactory.Layout(UIFactory.Button("Reset", cBody, "Reset to defaults", () => { GameInput.ResetBindings(); RefreshBindings(); }), 46);
            UIFactory.Layout(UIFactory.Button("Back", cBody, "Back", () => { GameInput.SaveBindings(); Show(Settings); }), 46);

            // ---------------- intro
            Intro = UIFactory.Rect("Intro", parent).Fill();
            var idim = UIFactory.Image("Dim", Intro, new Color(0, 0, 0, 0.82f), true); idim.rectTransform.Fill();
            introText = UIFactory.Text("Text", Intro, "", 28, UIFactory.TextMain, TextAnchor.MiddleLeft);
            introText.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 30), new Vector2(1000, 600));
            introText.lineSpacing = 1.2f;
            var ib = UIFactory.Button("Begin", Intro, "Begin", () => GameManager.Instance.SetPhase(GamePhase.Playing), 24);
            ((RectTransform)ib.transform).At(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 90), new Vector2(260, 54));

            // ---------------- ending
            Ending = UIFactory.Rect("Ending", parent).Fill();
            var edim = UIFactory.Image("Dim", Ending, new Color(0, 0, 0, 0.85f), true); edim.rectTransform.Fill();
            endingText = UIFactory.Text("Text", Ending, "", 28, UIFactory.TextMain, TextAnchor.MiddleCenter);
            endingText.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 60), new Vector2(1100, 600));
            var e1 = UIFactory.Button("Keep", Ending, "Continue exploring", () => GameManager.Instance.SetPhase(GamePhase.Playing), 22);
            ((RectTransform)e1.transform).At(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-10, 90), new Vector2(300, 54));
            var e2 = UIFactory.Button("Title", Ending, "Return to title", () => GameManager.Instance.ReturnToTitle(), 22);
            ((RectTransform)e2.transform).At(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(10, 90), new Vector2(300, 54));

            HideAll();
        }

        static RectTransform Modal(RectTransform parent, string name, string heading, out RectTransform body, float w, float h)
        {
            var root = UIFactory.Rect(name, parent).Fill();
            var dim = UIFactory.Image("Dim", root, new Color(0, 0, 0, 0.6f), true); dim.rectTransform.Fill();
            var panel = UIFactory.Image("Panel", root, UIFactory.Panel, true);
            panel.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(w, h));
            var edge = UIFactory.Image("Edge", panel.transform, UIFactory.Accent);
            edge.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -3), Vector2.zero);
            var head = UIFactory.Text("Heading", panel.transform, heading, 26, UIFactory.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            head.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(30, -64), new Vector2(-30, -10));
            body = UIFactory.Rect("Body", panel.transform).Place(Vector2.zero, Vector2.one, new Vector2(20, 20), new Vector2(-20, -70));
            return root;
        }

        static void SliderRow(RectTransform parent, string label, float min, float max, float value, System.Action<float> set, string fmt)
        {
            var row = UIFactory.Rect("Row_" + label, parent);
            UIFactory.Layout(row, 44);
            var name = UIFactory.Text("Name", row, label, 19, UIFactory.TextMain, TextAnchor.MiddleLeft);
            name.rectTransform.Place(Vector2.zero, new Vector2(0.45f, 1), Vector2.zero, Vector2.zero);
            var val = UIFactory.Text("Val", row, "", 18, UIFactory.TextDim, TextAnchor.MiddleRight);
            val.rectTransform.Place(new Vector2(0.86f, 0), Vector2.one, Vector2.zero, Vector2.zero);
            System.Action<float> show = v => val.text = v.ToString(fmt);
            var s = UIFactory.Slider("Slider", row, min, max, value, v => { set(v); show(v); GameSettings.Apply(); });
            ((RectTransform)s.transform).Place(new Vector2(0.47f, 0.2f), new Vector2(0.84f, 0.8f), Vector2.zero, Vector2.zero);
            show(value);
        }

        static void ToggleRow(RectTransform parent, string label, System.Func<bool> get, System.Action<bool> set)
        {
            var row = UIFactory.Rect("Row_" + label, parent);
            UIFactory.Layout(row, 40);
            var name = UIFactory.Text("Name", row, label, 19, UIFactory.TextMain, TextAnchor.MiddleLeft);
            name.rectTransform.Place(Vector2.zero, new Vector2(0.75f, 1), Vector2.zero, Vector2.zero);
            Button b = null;
            b = UIFactory.Button("Toggle", row, get() ? "ON" : "OFF", () =>
            {
                set(!get());
                b.GetComponentInChildren<Text>().text = get() ? "ON" : "OFF";
                GameSettings.Apply();
            }, 18);
            ((RectTransform)b.transform).Place(new Vector2(0.78f, 0.1f), new Vector2(1, 0.9f), Vector2.zero, Vector2.zero);
        }

        static Text CycleRow(RectTransform parent, string label, UnityEngine.Events.UnityAction prev, UnityEngine.Events.UnityAction next)
        {
            var row = UIFactory.Rect("Row_" + label, parent);
            UIFactory.Layout(row, 42);
            var name = UIFactory.Text("Name", row, label, 19, UIFactory.TextMain, TextAnchor.MiddleLeft);
            name.rectTransform.Place(Vector2.zero, new Vector2(0.4f, 1), Vector2.zero, Vector2.zero);
            var p = UIFactory.Button("Prev", row, "<", prev, 20);
            ((RectTransform)p.transform).Place(new Vector2(0.42f, 0.1f), new Vector2(0.5f, 0.9f), Vector2.zero, Vector2.zero);
            var val = UIFactory.Text("Val", row, "", 18, UIFactory.TextMain, TextAnchor.MiddleCenter);
            val.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.92f, 1), Vector2.zero, Vector2.zero);
            var n = UIFactory.Button("Next", row, ">", next, 20);
            ((RectTransform)n.transform).Place(new Vector2(0.92f, 0.1f), new Vector2(1f, 0.9f), Vector2.zero, Vector2.zero);
            return val;
        }

        void CycleQuality(int d)
        {
            int n = QualitySettings.names.Length;
            int cur = GameSettings.QualityLevel < 0 ? QualitySettings.GetQualityLevel() : GameSettings.QualityLevel;
            GameSettings.QualityLevel = (cur + d + n) % n;
            GameSettings.Apply();
            RefreshCycleLabels();
        }

        void CycleResolution(int d)
        {
            var res = Screen.resolutions;
            if (res.Length == 0) return;
            int cur = GameSettings.ResolutionIndex < 0 ? res.Length - 1 : GameSettings.ResolutionIndex;
            GameSettings.ResolutionIndex = (cur + d + res.Length) % res.Length;
            RefreshCycleLabels();
        }

        void RefreshCycleLabels()
        {
            int q = GameSettings.QualityLevel < 0 ? QualitySettings.GetQualityLevel() : GameSettings.QualityLevel;
            if (qualityLabel) qualityLabel.text = q >= 0 && q < QualitySettings.names.Length ? QualitySettings.names[q] : "Default";
            var res = Screen.resolutions;
            if (resolutionLabel)
                resolutionLabel.text = GameSettings.ResolutionIndex >= 0 && GameSettings.ResolutionIndex < res.Length
                    ? $"{res[GameSettings.ResolutionIndex].width} × {res[GameSettings.ResolutionIndex].height}"
                    : $"Native ({Screen.currentResolution.width} × {Screen.currentResolution.height})";
        }

        static string Pretty(string n) => n == "PDA" ? "Open PDA" : n == "ResetVehicle" ? "Recover rover" : n;

        void StartRebind(InputAction action, Text label)
        {
            rebind?.Cancel();
            int idx = GameInput.KeyboardBindingIndex(action);
            label.text = "…";
            controlsStatus.text = $"Press a key for {Pretty(action.name)} (ESC to cancel)";
            action.Disable();
            rebind = action.PerformInteractiveRebinding(idx)
                .WithControlsExcluding("<Mouse>/position").WithControlsExcluding("<Mouse>/delta")
                .WithCancelingThrough("<Keyboard>/escape")
                .OnComplete(op => { op.Dispose(); rebind = null; action.Enable(); GameInput.SaveBindings(); RefreshBindings(); controlsStatus.text = "Binding saved."; })
                .OnCancel(op => { op.Dispose(); rebind = null; action.Enable(); RefreshBindings(); controlsStatus.text = "Cancelled."; })
                .Start();
        }

        void RefreshBindings() { foreach (var r in bindRows) r.label.text = GameInput.Display(r.action); }

        public void OpenSettings(System.Action back)
        {
            settingsBack = back;
            RefreshCycleLabels();
            Show(Settings);
        }

        public void HideAll()
        {
            foreach (var r in new[] { Title, Pause, Settings, Controls, Intro, Ending }) r.gameObject.SetActive(false);
        }

        public void Show(RectTransform r)
        {
            HideAll();
            if (r == null) return;
            r.gameObject.SetActive(true);
            if (r == Title) continueButton.gameObject.SetActive(SaveSystem.HasSave());
            var first = r.GetComponentInChildren<Button>();
            if (first && UnityEngine.EventSystems.EventSystem.current) UnityEngine.EventSystems.EventSystem.current.SetSelectedGameObject(first.gameObject);
        }

        public void ShowIntro() { introText.text = StoryDatabase.Data.intro; Show(Intro); }
        public void ShowEnding()
        {
            endingText.text = $"<size=40><b>SUBSURFACE WATER ICE CONFIRMED</b></size>\n\n{StoryDatabase.Data.endOfContent}";
            Show(Ending);
        }

        public bool AnyOpen => Pause.gameObject.activeSelf || Settings.gameObject.activeSelf || Controls.gameObject.activeSelf;
        public bool InSubMenu => Settings.gameObject.activeSelf || Controls.gameObject.activeSelf;
        public bool Rebinding => rebind != null;

        public void Back()
        {
            if (Controls.gameObject.activeSelf) { GameInput.SaveBindings(); Show(Settings); }
            else if (Settings.gameObject.activeSelf) { GameSettings.Save(); GameSettings.Apply(); settingsBack?.Invoke(); }
        }
    }
}
