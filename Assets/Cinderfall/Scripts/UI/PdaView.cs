using System.Collections.Generic;
using Cinderfall.Core;
using Cinderfall.Player;
using Cinderfall.Story;
using Cinderfall.Vehicles;
using Cinderfall.World;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace Cinderfall.UI
{
    /// <summary>Expedition PDA: survey map, objectives, recovered logs and status.</summary>
    public class PdaView
    {
        public const float WorldExtent = 3072f;
        public readonly RectTransform Root;
        readonly RectTransform[] pages = new RectTransform[4];
        readonly Button[] tabs = new Button[4];
        int page;

        // map
        readonly RectTransform mapViewport, mapContent, playerArrow;
        readonly Text mapInfo;
        readonly List<(RectTransform icon, Text label, WorldMarker marker)> mapMarkers = new List<(RectTransform, Text, WorldMarker)>();
        float zoom = 1f;
        Vector2 pan;
        bool followPlayer = true;

        // objectives
        readonly Text objText;
        // logs
        readonly RectTransform logList;
        readonly Text logBody;
        readonly ScrollRect logScroll;
        string selectedLog;
        // status
        readonly Text statusText;

        public PdaView(RectTransform parent)
        {
            Root = UIFactory.Rect("PDA", parent).Fill();
            var dim = UIFactory.Image("Dim", Root, new Color(0, 0, 0, 0.55f), true); dim.rectTransform.Fill();
            var frame = UIFactory.Image("Frame", Root, UIFactory.Panel, true);
            frame.rectTransform.Place(new Vector2(0.08f, 0.07f), new Vector2(0.92f, 0.93f), Vector2.zero, Vector2.zero);
            var head = UIFactory.Text("Head", frame.transform, "EXPEDITION PDA  ·  CINDER RAIN SURVEY", 20, UIFactory.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            head.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(24, -52), new Vector2(-24, -8));
            var hint = UIFactory.Text("Hint", frame.transform, "", 15, UIFactory.TextDim, TextAnchor.MiddleRight);
            hint.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(24, -52), new Vector2(-24, -8));
            hint.text = $"[{GameInput.Display(GameInput.Pda)}] close";

            string[] names = { "MAP", "OBJECTIVES", "LOGS", "STATUS" };
            for (int i = 0; i < 4; i++)
            {
                int k = i;
                tabs[i] = UIFactory.Button("Tab" + names[i], frame.transform, names[i], () => SetPage(k), 18);
                ((RectTransform)tabs[i].transform).At(new Vector2(0, 1), new Vector2(0, 1), new Vector2(24 + i * 190, -60), new Vector2(180, 40));
                pages[i] = UIFactory.Rect("Page" + names[i], frame.transform).Place(Vector2.zero, Vector2.one, new Vector2(24, 24), new Vector2(-24, -112));
            }

            // ---- map page
            var vp = UIFactory.Image("Viewport", pages[0], new Color(0.02f, 0.02f, 0.02f, 1f), true);
            mapViewport = vp.rectTransform.Place(Vector2.zero, Vector2.one, Vector2.zero, new Vector2(-300, 0));
            vp.gameObject.AddComponent<RectMask2D>();
            var map = UIFactory.Rect("Map", mapViewport);
            var raw = map.gameObject.AddComponent<RawImage>();
            raw.texture = Resources.Load<Texture2D>("Map/survey_map");
            raw.raycastTarget = false;
            mapContent = map;
            var arrow = UIFactory.Image("Player", mapViewport, UIFactory.TextMain);
            arrow.sprite = UISprites.Triangle;
            playerArrow = arrow.rectTransform;
            playerArrow.sizeDelta = new Vector2(20, 24);
            mapInfo = UIFactory.Text("Info", pages[0], "", 17, UIFactory.TextMain);
            mapInfo.rectTransform.Place(new Vector2(1, 0), new Vector2(1, 1), new Vector2(-284, 0), Vector2.zero);

            // ---- objectives page
            objText = UIFactory.Text("Objectives", pages[1], "", 21, UIFactory.TextMain);
            objText.rectTransform.Fill(16);

            // ---- logs page
            var listBg = UIFactory.Image("ListBg", pages[2], UIFactory.PanelLight, true);
            listBg.rectTransform.Place(Vector2.zero, new Vector2(0.34f, 1), Vector2.zero, Vector2.zero);
            logList = UIFactory.Rect("List", listBg.transform).Fill(8);
            UIFactory.VerticalLayout(logList.gameObject, 6, 4);
            var bodyBg = UIFactory.Image("BodyBg", pages[2], UIFactory.PanelLight, true);
            bodyBg.rectTransform.Place(new Vector2(0.35f, 0), Vector2.one, Vector2.zero, Vector2.zero);
            logScroll = bodyBg.gameObject.AddComponent<ScrollRect>();
            logScroll.horizontal = false; logScroll.scrollSensitivity = 30;
            var bodyVp = UIFactory.Rect("Viewport", bodyBg.transform).Fill(18);
            bodyVp.gameObject.AddComponent<RectMask2D>();
            logBody = UIFactory.Text("Body", bodyVp, "", 21, UIFactory.TextMain);
            logBody.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), Vector2.zero, Vector2.zero);
            logBody.rectTransform.pivot = new Vector2(0.5f, 1);
            var fitter = logBody.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            logScroll.viewport = bodyVp; logScroll.content = logBody.rectTransform;

            // ---- status page
            statusText = UIFactory.Text("Status", pages[3], "", 21, UIFactory.TextMain);
            statusText.rectTransform.Fill(16);

            SetPage(0);
        }

        public void SetPage(int p)
        {
            page = p;
            for (int i = 0; i < 4; i++)
            {
                pages[i].gameObject.SetActive(i == p);
                tabs[i].GetComponent<Image>().color = i == p ? new Color(0.35f, 0.2f, 0.1f, 1f) : new Color(0.12f, 0.1f, 0.09f, 0.9f);
            }
            if (p == 1) RefreshObjectives();
            if (p == 2) RefreshLogs();
        }

        public void OnOpen()
        {
            followPlayer = true; pan = Vector2.zero;
            RefreshMarkers();
            SetPage(page);
        }

        public void OpenLogPage(string id) { selectedLog = id; SetPage(2); }

        // ------------------------------------------------------------------ map
        void RefreshMarkers()
        {
            foreach (var m in mapMarkers) Object.Destroy(m.icon.gameObject);
            mapMarkers.Clear();
            foreach (var wm in WorldMarker.All)
            {
                var img = UIFactory.Image("M_" + wm.id, mapViewport, UIFactory.TextMain);
                img.sprite = wm.isLandmark ? UISprites.Ring : UISprites.Diamond;
                img.rectTransform.sizeDelta = new Vector2(16, 16);
                var t = UIFactory.Text("Label", img.transform, wm.label, 14, UIFactory.TextMain, TextAnchor.MiddleLeft);
                t.rectTransform.At(new Vector2(1, 0.5f), new Vector2(0, 0.5f), new Vector2(6, 0), new Vector2(260, 20));
                var sh = t.gameObject.AddComponent<Shadow>(); sh.effectColor = Color.black;
                mapMarkers.Add((img.rectTransform, t, wm));
            }
            playerArrow.SetAsLastSibling();
        }

        Vector2 WorldToMap(Vector3 w, float size) => new Vector2((w.x / (2 * WorldExtent)) * size, (w.z / (2 * WorldExtent)) * size);

        void UpdateMap()
        {
            var vpRect = mapViewport.rect;
            float baseSize = Mathf.Min(vpRect.width, vpRect.height);
            float size = baseSize * zoom;
            var mouse = Mouse.current;
            if (mouse != null && RectTransformUtility.RectangleContainsScreenPoint(mapViewport, mouse.position.ReadValue(), null))
            {
                float scroll = mouse.scroll.ReadValue().y;
                if (Mathf.Abs(scroll) > 0.01f) zoom = Mathf.Clamp(zoom * (scroll > 0 ? 1.25f : 0.8f), 1f, 12f);
                if (mouse.leftButton.isPressed)
                {
                    Vector2 d = mouse.delta.ReadValue();
                    var canvas = mapViewport.GetComponentInParent<Canvas>();
                    float s = canvas ? 1f / canvas.scaleFactor : 1f;
                    pan += d * s; followPlayer = false;
                }
                if (mouse.rightButton.wasPressedThisFrame) { followPlayer = true; pan = Vector2.zero; }
            }
            var cam = Camera.main;
            Vector3 pp = cam ? cam.transform.position : Vector3.zero;
            Vector2 playerMap = WorldToMap(pp, size);
            Vector2 offset = followPlayer && zoom > 1.01f ? -playerMap : pan;
            if (zoom <= 1.01f && followPlayer) offset = Vector2.zero;
            float lim = Mathf.Max(0, (size - baseSize) * 0.5f);
            offset.x = Mathf.Clamp(offset.x, -lim - baseSize * 0.4f, lim + baseSize * 0.4f);
            offset.y = Mathf.Clamp(offset.y, -lim - baseSize * 0.4f, lim + baseSize * 0.4f);
            if (!followPlayer) pan = offset;
            mapContent.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), offset, new Vector2(size, size));
            playerArrow.anchorMin = playerArrow.anchorMax = new Vector2(0.5f, 0.5f);
            playerArrow.anchoredPosition = offset + playerMap;
            float yaw = cam ? cam.transform.eulerAngles.y : 0f;
            playerArrow.localRotation = Quaternion.Euler(0, 0, -yaw);

            var om = ObjectiveManager.Instance;
            foreach (var m in mapMarkers)
            {
                if (m.marker == null) continue;
                bool active = om && om.IsActiveMarker(m.marker.id);
                bool visible = active || m.marker.alwaysOnMap;
                m.icon.gameObject.SetActive(visible);
                if (!visible) continue;
                m.icon.anchorMin = m.icon.anchorMax = new Vector2(0.5f, 0.5f);
                m.icon.anchoredPosition = offset + WorldToMap(m.marker.transform.position, size);
                var img = m.icon.GetComponent<Image>();
                img.color = active ? UIFactory.Accent : new Color(0.9f, 0.86f, 0.8f, 0.85f);
                m.icon.sizeDelta = active ? new Vector2(22, 22) : new Vector2(14, 14);
                m.label.color = active ? UIFactory.Accent : UIFactory.TextMain;
            }

            var cur = om ? om.Current : null;
            var mk = cur != null ? WorldMarker.Find(cur.marker) : null;
            string target = mk ? $"\n\n<color=#{UIFactory.Hex(UIFactory.Accent)}>TARGET</color>\n{mk.label}\n{HudView.FormatDistance(Vector3.Distance(pp, mk.transform.position))}  {HudView.Bearing(mk.transform.position - pp)}" : "";
            mapInfo.text = $"<color=#{UIFactory.Hex(UIFactory.Accent)}>POSITION</color>\n{pp.x:0} E   {pp.z:0} N\nElevation {pp.y:0} m\nHeading {HudView.Bearing(cam ? cam.transform.forward : Vector3.forward)}{target}\n\n<color=#{UIFactory.Hex(UIFactory.TextDim)}>Scroll: zoom ({zoom:0.0}x)\nDrag: pan\nRight-click: recenter\n\nSurvey area 6.1 × 6.1 km\nGrid: 1 unit = 1 m</color>";
        }

        // ------------------------------------------------------------------ objectives / logs
        void RefreshObjectives()
        {
            var list = StoryDatabase.Objectives;
            var om = ObjectiveManager.Instance;
            var sb = new System.Text.StringBuilder();
            string acc = UIFactory.Hex(UIFactory.Accent), dim = UIFactory.Hex(UIFactory.TextDim), good = UIFactory.Hex(UIFactory.Good);
            sb.Append($"<color=#{acc}><b>CURRENT</b></color>\n");
            if (om && om.Current != null) sb.Append($"<size=26><b>{om.Current.title}</b></size>\n<color=#{dim}>{om.Current.description}</color>\n\n");
            else sb.Append("All current objectives complete.\n\n");
            sb.Append($"<color=#{acc}><b>COMPLETED</b></color>\n");
            int done = 0;
            for (int i = 0; i < list.Count; i++)
                if (WorldState.Has(list[i].completeFlag)) { sb.Append($"<color=#{good}>•</color>  {list[i].title}\n"); done++; }
            if (done == 0) sb.Append($"<color=#{dim}>None yet.</color>\n");
            sb.Append($"\n<color=#{dim}>Mission progress: {done} / {list.Count}</color>");
            objText.text = sb.ToString();
        }

        void RefreshLogs()
        {
            for (int i = logList.childCount - 1; i >= 0; i--) Object.Destroy(logList.GetChild(i).gameObject);
            var all = StoryDatabase.Data.logs;
            string first = null;
            foreach (var l in all)
            {
                if (!WorldState.Has("log." + l.id)) continue;
                if (first == null) first = l.id;
                string id = l.id;
                string tag = l.type == "diary" ? "DIARY" : l.type == "discovery" ? "DISCOVERY" : l.type == "mission" ? "MISSION" : "CLUE";
                var b = UIFactory.Button("Log_" + id, logList, $"<size=13><color=#{UIFactory.Hex(UIFactory.Accent)}>{tag}</color></size>\n{l.title}", () => { selectedLog = id; ShowLog(id); }, 18);
                var label = b.GetComponentInChildren<Text>(); label.alignment = TextAnchor.MiddleLeft; label.rectTransform.Fill(10);
                UIFactory.Layout(b, 58);
            }
            if (first == null) { logBody.text = $"<color=#{UIFactory.Hex(UIFactory.TextDim)}>No records recovered yet.</color>"; return; }
            ShowLog(selectedLog != null && WorldState.Has("log." + selectedLog) ? selectedLog : first);
        }

        void ShowLog(string id)
        {
            logBody.text = LogReaderView.Format(StoryDatabase.GetLog(id));
            logScroll.verticalNormalizedPosition = 1f;
        }

        void UpdateStatus()
        {
            var suit = SuitSystem.Instance;
            var rover = RoverController.Instance;
            var gm = GameManager.Instance;
            string acc = UIFactory.Hex(UIFactory.Accent), dim = UIFactory.Hex(UIFactory.TextDim);
            float t = gm ? gm.PlayTime : 0f;
            string rv = rover == null ? "Unknown" : rover.Powered ? $"Powered · {HudView.FormatDistance(Vector3.Distance(Camera.main ? Camera.main.transform.position : Vector3.zero, rover.transform.position))} away" : "No power (battery disconnected)";
            statusText.text =
                $"<color=#{acc}><b>SUIT</b></color>\nOxygen  {(suit ? suit.Oxygen : 1f) * 100:0}%\nPower   {(suit ? suit.Power : 1f) * 100:0}%\nLamp    {(suit && suit.LampOn ? "On" : "Off")}\nSurvival systems: {(GameSettings.SurvivalEnabled ? "Active" : "Disabled in settings")}\n\n" +
                $"<color=#{acc}><b>ROVER</b></color>\n{rv}\n\n" +
                $"<color=#{acc}><b>MISSION</b></color>\nMars, 2043 · Cinder Rain survey area\nMission time {Mathf.FloorToInt(t / 3600f):00}:{Mathf.FloorToInt(t / 60f) % 60:00}:{Mathf.FloorToInt(t) % 60:00}\n\n" +
                $"<color=#{dim}>Gravity 3.72 m/s² · Surface pressure ~0.6 kPa</color>";
        }

        public void Update()
        {
            if (!Root.gameObject.activeInHierarchy) return;
            var kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.digit1Key.wasPressedThisFrame) SetPage(0);
                if (kb.digit2Key.wasPressedThisFrame) SetPage(1);
                if (kb.digit3Key.wasPressedThisFrame) SetPage(2);
                if (kb.digit4Key.wasPressedThisFrame) SetPage(3);
            }
            if (page == 0) UpdateMap();
            if (page == 3) UpdateStatus();
        }
    }
}
