using System;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace Cinderfall.UI
{
    /// <summary>Small helper for building consistent uGUI layouts from code.</summary>
    public static class UIFactory
    {
        public static readonly Color Panel = new Color(0.045f, 0.038f, 0.034f, 0.88f);
        public static readonly Color PanelLight = new Color(0.11f, 0.09f, 0.08f, 0.92f);
        public static readonly Color Accent = new Color(1f, 0.6f, 0.27f, 1f);
        public static readonly Color AccentDim = new Color(1f, 0.6f, 0.27f, 0.35f);
        public static readonly Color TextMain = new Color(0.93f, 0.89f, 0.83f, 1f);
        public static readonly Color TextDim = new Color(0.66f, 0.61f, 0.56f, 1f);
        public static readonly Color Warning = new Color(1f, 0.78f, 0.25f, 1f);
        public static readonly Color Critical = new Color(1f, 0.3f, 0.22f, 1f);
        public static readonly Color Good = new Color(0.45f, 0.95f, 0.6f, 1f);
        public static readonly Color Cool = new Color(0.55f, 0.85f, 1f, 1f);

        static Font font;
        public static Font Font
        {
            get
            {
                if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return font;
            }
        }

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        public static RectTransform Place(this RectTransform r, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            r.anchorMin = anchorMin; r.anchorMax = anchorMax; r.offsetMin = offsetMin; r.offsetMax = offsetMax;
            return r;
        }

        /// <summary>Anchor at a point with a fixed size.</summary>
        public static RectTransform At(this RectTransform r, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            r.anchorMin = r.anchorMax = anchor; r.pivot = pivot; r.anchoredPosition = pos; r.sizeDelta = size;
            return r;
        }

        public static RectTransform Fill(this RectTransform r, float pad = 0f) => r.Place(Vector2.zero, Vector2.one, new Vector2(pad, pad), new Vector2(-pad, -pad));

        public static Image Image(string name, Transform parent, Color color, bool raycast = false)
        {
            var r = Rect(name, parent);
            var img = r.gameObject.AddComponent<Image>();
            img.color = color; img.raycastTarget = raycast;
            return img;
        }

        public static Text Text(string name, Transform parent, string value, int size, Color color, TextAnchor align = TextAnchor.UpperLeft, FontStyle style = FontStyle.Normal)
        {
            var r = Rect(name, parent);
            var t = r.gameObject.AddComponent<Text>();
            t.font = Font; t.text = value; t.fontSize = size; t.color = color; t.alignment = align; t.fontStyle = style;
            t.raycastTarget = false; t.supportRichText = true;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow;
            return t;
        }

        public static Button Button(string name, Transform parent, string label, UnityAction onClick, int size = 22)
        {
            var img = Image(name, parent, new Color(0.12f, 0.1f, 0.09f, 0.9f), true);
            var b = img.gameObject.AddComponent<Button>();
            var colors = b.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(1.6f, 1.25f, 1.0f, 1f);
            colors.selectedColor = new Color(1.6f, 1.25f, 1.0f, 1f);
            colors.pressedColor = new Color(2.2f, 1.6f, 1.1f, 1f);
            colors.colorMultiplier = 1.6f;
            b.colors = colors;
            b.onClick.AddListener(() => Core.GameEvents.PlaySound("click"));
            if (onClick != null) b.onClick.AddListener(onClick);
            var t = Text("Label", img.transform, label, size, TextMain, TextAnchor.MiddleCenter);
            t.rectTransform.Fill(6);
            var accent = Image("Edge", img.transform, AccentDim);
            accent.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 1), Vector2.zero, new Vector2(3, 0));
            return b;
        }

        public static Slider Slider(string name, Transform parent, float min, float max, float value, Action<float> onChange)
        {
            var root = Rect(name, parent);
            var s = root.gameObject.AddComponent<Slider>();
            var bg = Image("Background", root, new Color(0.2f, 0.17f, 0.15f, 1f), true);
            bg.rectTransform.Place(new Vector2(0, 0.35f), new Vector2(1, 0.65f), Vector2.zero, Vector2.zero);
            var fillArea = Rect("Fill Area", root).Place(new Vector2(0, 0.35f), new Vector2(1, 0.65f), Vector2.zero, Vector2.zero);
            var fill = Image("Fill", fillArea, Accent);
            fill.rectTransform.Fill();
            var handleArea = Rect("Handle Area", root).Fill();
            var handle = Image("Handle", handleArea, TextMain, true);
            handle.rectTransform.sizeDelta = new Vector2(14, 0);
            s.fillRect = fill.rectTransform; s.handleRect = handle.rectTransform; s.targetGraphic = handle;
            s.minValue = min; s.maxValue = max; s.value = value;
            s.onValueChanged.AddListener(v => onChange?.Invoke(v));
            return s;
        }

        public static void VerticalLayout(GameObject go, float spacing, int pad, TextAnchor align = TextAnchor.UpperLeft, bool expandWidth = true)
        {
            var v = go.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing; v.padding = new RectOffset(pad, pad, pad, pad); v.childAlignment = align;
            v.childControlWidth = true; v.childControlHeight = true; v.childForceExpandWidth = expandWidth; v.childForceExpandHeight = false;
        }

        public static LayoutElement Layout(Component c, float prefHeight = -1, float prefWidth = -1, float flexW = -1)
        {
            var le = c.gameObject.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
            if (prefHeight >= 0) { le.preferredHeight = prefHeight; le.minHeight = prefHeight; }
            if (prefWidth >= 0) le.preferredWidth = prefWidth;
            if (flexW >= 0) le.flexibleWidth = flexW;
            return le;
        }

        public static string Hex(Color c) => ColorUtility.ToHtmlStringRGB(c);
    }
}
