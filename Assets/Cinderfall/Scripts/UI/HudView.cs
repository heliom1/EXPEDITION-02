using System.Collections.Generic;
using Cinderfall.Core;
using Cinderfall.Interaction;
using Cinderfall.Machines;
using Cinderfall.Player;
using Cinderfall.Story;
using Cinderfall.Vehicles;
using Cinderfall.World;
using UnityEngine;
using UnityEngine.UI;

namespace Cinderfall.UI
{
    /// <summary>In-game HUD: crosshair, interaction prompt, objective tracker, compass, objective marker,
    /// suit status, notifications, rover and drill readouts.</summary>
    public class HudView
    {
        public readonly RectTransform Root;
        readonly Image crosshair;
        const float PxPerDeg = 640f / 120f;
        readonly RectTransform compassStrip;
        readonly Text prompt, objTitle, objDesc, objDist, location, roverText, drillText;
        readonly Image o2Fill, pwrFill, lampIcon;
        readonly Text o2Label, pwrLabel, chargeLabel;
        readonly RectTransform compassMarker, worldMarker, noticeRoot;
        readonly Text worldMarkerText;
        readonly RectTransform roverPanel;
        readonly List<(Text text, Image bg, float time)> notices = new List<(Text, Image, float)>();

        public HudView(RectTransform parent)
        {
            Root = UIFactory.Rect("HUD", parent).Fill();

            // crosshair + prompt
            crosshair = UIFactory.Image("Crosshair", Root, new Color(1, 1, 1, 0.55f));
            crosshair.sprite = UISprites.Circle;
            crosshair.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(6, 6));
            prompt = UIFactory.Text("Prompt", Root, "", 24, UIFactory.TextMain, TextAnchor.MiddleCenter);
            prompt.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 1f), new Vector2(0, -38), new Vector2(900, 40));
            AddShadow(prompt);

            // objective tracker (top-left)
            var obj = UIFactory.Rect("Objective", Root).At(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -30), new Vector2(560, 140));
            var objHead = UIFactory.Text("Head", obj, "OBJECTIVE", 15, UIFactory.Accent, TextAnchor.UpperLeft, FontStyle.Bold);
            objHead.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -22), Vector2.zero);
            objTitle = UIFactory.Text("Title", obj, "", 24, UIFactory.TextMain, TextAnchor.UpperLeft, FontStyle.Bold);
            objTitle.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -56), new Vector2(0, -22));
            objDesc = UIFactory.Text("Desc", obj, "", 17, UIFactory.TextDim);
            objDesc.rectTransform.Place(new Vector2(0, 0), new Vector2(1, 1), new Vector2(0, 0), new Vector2(0, -58));
            objDist = UIFactory.Text("Dist", obj, "", 17, UIFactory.Accent);
            objDist.rectTransform.Place(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, -26), new Vector2(0, 0));
            AddShadow(objTitle); AddShadow(objDesc); AddShadow(objHead); AddShadow(objDist);

            // compass (top-centre)
            var comp = UIFactory.Image("Compass", Root, new Color(0, 0, 0, 0.35f));
            comp.rectTransform.At(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(640, 34));
            comp.gameObject.AddComponent<RectMask2D>();
            compassStrip = UIFactory.Rect("Strip", comp.transform).At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(10, 34));
            string[] names = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
            for (int deg = -360; deg <= 360; deg += 15)
            {
                int a = ((deg % 360) + 360) % 360;
                bool major = a % 45 == 0;
                var tick = UIFactory.Text("T" + deg, compassStrip, major ? names[a / 45] : "|", major ? 18 : 11,
                    a == 0 ? UIFactory.Accent : major ? UIFactory.TextMain : UIFactory.TextDim, TextAnchor.MiddleCenter, major ? FontStyle.Bold : FontStyle.Normal);
                tick.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(deg * PxPerDeg, 0), new Vector2(60, 34));
            }
            var cMid = UIFactory.Image("Mid", comp.transform, UIFactory.Accent);
            cMid.rectTransform.At(new Vector2(0.5f, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(2, 8));
            var cm = UIFactory.Image("ObjMarker", comp.transform, UIFactory.Accent);
            cm.sprite = UISprites.Diamond;
            compassMarker = cm.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(14, 14));
            location = UIFactory.Text("Location", Root, "", 16, UIFactory.TextDim, TextAnchor.UpperCenter);
            location.rectTransform.At(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -62), new Vector2(700, 24));
            AddShadow(location);
            drillText = UIFactory.Text("Drill", Root, "", 18, UIFactory.Warning, TextAnchor.UpperCenter);
            drillText.rectTransform.At(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -88), new Vector2(900, 26));
            AddShadow(drillText);

            // world-space objective marker
            var wm = UIFactory.Image("WorldMarker", Root, UIFactory.Accent);
            wm.sprite = UISprites.Diamond;
            worldMarker = wm.rectTransform.At(Vector2.zero, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(18, 18));
            worldMarkerText = UIFactory.Text("Dist", wm.transform, "", 15, UIFactory.TextMain, TextAnchor.UpperCenter);
            worldMarkerText.rectTransform.At(new Vector2(0.5f, 0), new Vector2(0.5f, 1), new Vector2(0, -4), new Vector2(200, 22));
            AddShadow(worldMarkerText);

            // suit (bottom-left)
            var suit = UIFactory.Image("Suit", Root, new Color(0, 0, 0, 0.35f));
            suit.rectTransform.At(Vector2.zero, Vector2.zero, new Vector2(30, 30), new Vector2(330, 92));
            o2Fill = Bar(suit.rectTransform, "O2", new Vector2(14, -18), UIFactory.Cool, out o2Label);
            pwrFill = Bar(suit.rectTransform, "PWR", new Vector2(14, -50), UIFactory.Accent, out pwrLabel);
            lampIcon = UIFactory.Image("Lamp", suit.transform, UIFactory.TextDim);
            lampIcon.sprite = UISprites.SoftCircle;
            lampIcon.rectTransform.At(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-12, -12), new Vector2(18, 18));
            chargeLabel = UIFactory.Text("Charge", suit.transform, "", 13, UIFactory.Good, TextAnchor.LowerRight);
            chargeLabel.rectTransform.Place(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 4), new Vector2(-12, 22));

            // rover (bottom-right)
            var rp = UIFactory.Image("Rover", Root, new Color(0, 0, 0, 0.35f));
            roverPanel = rp.rectTransform.At(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-30, 30), new Vector2(330, 92));
            roverText = UIFactory.Text("Text", rp.transform, "", 19, UIFactory.TextMain);
            roverText.rectTransform.Fill(12);

            // notices (right)
            noticeRoot = UIFactory.Rect("Notices", Root).At(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-30, -120), new Vector2(520, 400));
        }

        static void AddShadow(Graphic g)
        {
            var s = g.gameObject.AddComponent<Shadow>();
            s.effectColor = new Color(0, 0, 0, 0.8f); s.effectDistance = new Vector2(1.5f, -1.5f);
        }

        static Image Bar(RectTransform parent, string label, Vector2 pos, Color c, out Text valueText)
        {
            var l = UIFactory.Text(label, parent, label, 15, UIFactory.TextDim, TextAnchor.MiddleLeft, FontStyle.Bold);
            l.rectTransform.At(new Vector2(0, 1), new Vector2(0, 1), pos, new Vector2(50, 22));
            var bg = UIFactory.Image(label + "Bg", parent, new Color(1, 1, 1, 0.1f));
            bg.rectTransform.At(new Vector2(0, 1), new Vector2(0, 1), pos + new Vector2(52, -6), new Vector2(190, 10));
            var fill = UIFactory.Image(label + "Fill", bg.transform, c);
            fill.rectTransform.Place(Vector2.zero, new Vector2(1, 1), Vector2.zero, Vector2.zero);
            valueText = UIFactory.Text(label + "Val", parent, "", 15, UIFactory.TextMain, TextAnchor.MiddleRight);
            valueText.rectTransform.At(new Vector2(0, 1), new Vector2(0, 1), pos + new Vector2(248, 0), new Vector2(50, 22));
            return fill;
        }

        public void AddNotice(string text, NoticeKind kind)
        {
            Color c = kind == NoticeKind.Critical ? UIFactory.Critical : kind == NoticeKind.Warning ? UIFactory.Warning
                : kind == NoticeKind.Objective ? UIFactory.Accent : kind == NoticeKind.Discovery ? UIFactory.Cool : UIFactory.TextMain;
            var bg = UIFactory.Image("Notice", noticeRoot, new Color(0, 0, 0, 0.45f));
            var t = UIFactory.Text("Text", bg.transform, text, 19, c, TextAnchor.MiddleRight);
            t.rectTransform.Fill(8);
            notices.Insert(0, (t, bg, Time.unscaledTime));
            while (notices.Count > 6) { Object.Destroy(notices[notices.Count - 1].bg.gameObject); notices.RemoveAt(notices.Count - 1); }
            Layout();
            if (kind == NoticeKind.Discovery) GameEvents.PlaySound("discovery");
        }

        void Layout()
        {
            float y = 0;
            foreach (var n in notices)
            {
                float h = Mathf.Max(36, n.text.preferredHeight + 14);
                n.bg.rectTransform.At(new Vector2(1, 1), new Vector2(1, 1), new Vector2(0, -y), new Vector2(Mathf.Min(520, n.text.preferredWidth + 30), h));
                y += h + 6;
            }
        }

        public void Update()
        {
            var gm = GameManager.Instance;
            var player = gm ? gm.player : null;
            var rover = RoverController.Instance;
            bool driving = rover && rover.Occupied;
            var cam = Camera.main;

            // notices fade
            for (int i = notices.Count - 1; i >= 0; i--)
            {
                float age = Time.unscaledTime - notices[i].time;
                float a = Mathf.Clamp01((8f - age) / 1.5f);
                notices[i].text.color = new Color(notices[i].text.color.r, notices[i].text.color.g, notices[i].text.color.b, a);
                notices[i].bg.color = new Color(0, 0, 0, 0.45f * a);
                if (a <= 0f) { Object.Destroy(notices[i].bg.gameObject); notices.RemoveAt(i); Layout(); }
            }

            // prompt
            var inter = player ? player.GetComponent<Interactor>() : null;
            var focused = inter && !inter.InputBlocked ? inter.Focused : null;
            string key = GameInput.Display(GameInput.Interact);
            prompt.text = focused != null && focused.IsAvailable ? $"<color=#{UIFactory.Hex(UIFactory.Accent)}>[{key}]</color>  {focused.Prompt}" : "";
            crosshair.color = focused != null ? UIFactory.Accent : new Color(1, 1, 1, 0.5f);
            crosshair.enabled = !driving;

            // objective
            var om = ObjectiveManager.Instance;
            var cur = om ? om.Current : null;
            objTitle.text = cur != null ? cur.title : (om && om.IsComplete ? "All current objectives complete" : "");
            objDesc.text = cur != null ? cur.description : "";
            var marker = cur != null ? WorldMarker.Find(cur.marker) : null;
            Vector3 viewPos = cam ? cam.transform.position : Vector3.zero;
            if (marker && cam)
            {
                float d = Vector3.Distance(viewPos, marker.transform.position);
                objDist.text = FormatDistance(d) + "  " + Bearing(marker.transform.position - viewPos);
                // screen marker
                Vector3 sp = cam.WorldToScreenPoint(marker.transform.position + Vector3.up * 1.5f);
                var canvasRect = (RectTransform)Root.parent;
                float scale = canvasRect.rect.width / Screen.width;
                bool behind = sp.z < 0;
                Vector2 p = new Vector2(sp.x, sp.y) * scale;
                Vector2 size = canvasRect.rect.size;
                if (behind) p = new Vector2(size.x - p.x, 40);
                p.x = Mathf.Clamp(p.x, 40, size.x - 40); p.y = Mathf.Clamp(p.y, 40, size.y - 120);
                worldMarker.gameObject.SetActive(d > 6f);
                worldMarker.anchoredPosition = p;
                worldMarkerText.text = FormatDistance(d);
            }
            else { objDist.text = ""; worldMarker.gameObject.SetActive(false); }

            // compass
            if (cam)
            {
                float yaw = cam.transform.eulerAngles.y;
                const float pxPerDeg = PxPerDeg;
                compassStrip.anchoredPosition = new Vector2(-Mathf.DeltaAngle(0, yaw) * pxPerDeg, 0);
                if (marker)
                {
                    Vector3 dir = marker.transform.position - viewPos;
                    float mb = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
                    float rel = Mathf.DeltaAngle(yaw, mb);
                    compassMarker.gameObject.SetActive(Mathf.Abs(rel) < 60f);
                    compassMarker.anchoredPosition = new Vector2(rel * pxPerDeg, 0);
                }
                else compassMarker.gameObject.SetActive(false);
            }

            // location
            var cave = CaveAtmosphere.Instance;
            if (cave && cave.PlayerInside) location.text = $"CAVE  ·  {cave.Depth:0} m from entrance";
            else if (cam) location.text = $"CINDER RAIN  ·  {cam.transform.position.x:0} E  {cam.transform.position.z:0} N  ·  elev {cam.transform.position.y:0} m";

            // suit
            var suit = SuitSystem.Instance;
            if (suit)
            {
                o2Fill.rectTransform.anchorMax = new Vector2(suit.Oxygen, 1);
                pwrFill.rectTransform.anchorMax = new Vector2(suit.Power, 1);
                o2Label.text = $"{suit.Oxygen * 100:0}%";
                pwrLabel.text = $"{suit.Power * 100:0}%";
                o2Fill.color = suit.Oxygen < 0.15f ? UIFactory.Critical : UIFactory.Cool;
                pwrFill.color = suit.Power < 0.15f ? UIFactory.Critical : UIFactory.Accent;
                lampIcon.color = suit.LampOn ? new Color(1f, 0.95f, 0.8f) : new Color(1, 1, 1, 0.15f);
                chargeLabel.text = suit.Recharging ? "RECHARGING" : (GameSettings.SurvivalEnabled ? "" : "SURVIVAL OFF");
            }

            // rover
            roverPanel.gameObject.SetActive(driving);
            if (driving)
            {
                string pw = rover.Powered ? $"<color=#{UIFactory.Hex(UIFactory.Good)}>POWER OK</color>" : $"<color=#{UIFactory.Hex(UIFactory.Critical)}>NO POWER</color>";
                roverText.text = $"<size=34><b>{Mathf.Abs(rover.ForwardSpeed) * 3.6f:0}</b></size> km/h   {pw}\n<color=#{UIFactory.Hex(UIFactory.TextDim)}>[{GameInput.Display(GameInput.Interact)}] exit   [{GameInput.Display(GameInput.Brake)}] brake   [{GameInput.Display(GameInput.ResetVehicle)}] recover</color>";
            }

            // drill
            var drill = DrillMachine.Instance;
            if (drill && cam && drill.Current != DrillMachine.State.Idle && drill.Current != DrillMachine.State.Complete
                && Vector3.Distance(viewPos, drill.transform.position) < 120f)
                drillText.text = drill.StatusText;
            else drillText.text = "";
        }

        public static string FormatDistance(float m) => m >= 1000f ? $"{m / 1000f:0.00} km" : $"{m:0} m";

        public static string Bearing(Vector3 dir)
        {
            float b = (Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg + 360f) % 360f;
            string[] n = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
            return $"{n[Mathf.RoundToInt(b / 45f) % 8]} {b:000}°";
        }
    }
}
