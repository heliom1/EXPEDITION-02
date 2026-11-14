using Cinderfall.Core;
using Cinderfall.Story;
using UnityEngine;
using UnityEngine.UI;

namespace Cinderfall.UI
{
    /// <summary>Modal reader for diary pages, clue records and mission messages.</summary>
    public class LogReaderView
    {
        public readonly RectTransform Root;
        readonly Text body;
        readonly ScrollRect scroll;

        public LogReaderView(RectTransform parent, System.Action onClose)
        {
            Root = UIFactory.Rect("LogReader", parent).Fill();
            var dim = UIFactory.Image("Dim", Root, new Color(0, 0, 0, 0.6f), true); dim.rectTransform.Fill();
            var panel = UIFactory.Image("Panel", Root, UIFactory.Panel, true);
            panel.rectTransform.At(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(980, 760));
            var edge = UIFactory.Image("Edge", panel.transform, UIFactory.Accent);
            edge.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -3), Vector2.zero);
            scroll = panel.gameObject.AddComponent<ScrollRect>();
            scroll.horizontal = false; scroll.scrollSensitivity = 30;
            var vp = UIFactory.Rect("Viewport", panel.transform).Place(Vector2.zero, Vector2.one, new Vector2(40, 90), new Vector2(-40, -36));
            vp.gameObject.AddComponent<RectMask2D>();
            body = UIFactory.Text("Body", vp, "", 23, UIFactory.TextMain);
            body.rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), Vector2.zero, Vector2.zero);
            body.rectTransform.pivot = new Vector2(0.5f, 1);
            body.lineSpacing = 1.15f;
            body.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            scroll.viewport = vp; scroll.content = body.rectTransform;
            var close = UIFactory.Button("Close", panel.transform, "Close", () => onClose?.Invoke(), 20);
            ((RectTransform)close.transform).At(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(220, 46));
        }

        public void Show(string id)
        {
            body.text = Format(StoryDatabase.GetLog(id));
            scroll.verticalNormalizedPosition = 1f;
        }

        public void ShowText(string text)
        {
            body.text = text;
            scroll.verticalNormalizedPosition = 1f;
        }

        public static string Format(LogEntry e)
        {
            if (e == null) return "Record unavailable.";
            string acc = UIFactory.Hex(UIFactory.Accent), dim = UIFactory.Hex(UIFactory.TextDim), warn = UIFactory.Hex(UIFactory.Warning);
            string type = e.type == "diary" ? "PERSONAL LOG" : e.type == "discovery" ? "DISCOVERY" : e.type == "mission" ? "MISSION MESSAGE" : "FIELD RECORD";
            var sb = new System.Text.StringBuilder();
            sb.Append($"<color=#{acc}><size=16><b>{type}</b></size></color>\n");
            sb.Append($"<size=32><b>{e.title}</b></size>\n");
            if (!string.IsNullOrEmpty(e.author) || !string.IsNullOrEmpty(e.stamp))
                sb.Append($"<color=#{dim}><size=18>{e.author}{(string.IsNullOrEmpty(e.stamp) ? "" : "  ·  " + e.stamp)}</size></color>\n");
            sb.Append("\n").Append(e.body);
            if (e.placeholder) sb.Append($"\n\n<color=#{warn}><size=15>Contains placeholder text pending the authoritative story (OPEN STORY DECISION).</size></color>");
            return sb.ToString();
        }
    }
}
