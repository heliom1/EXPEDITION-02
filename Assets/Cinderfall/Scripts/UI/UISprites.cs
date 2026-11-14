using UnityEngine;

namespace Cinderfall.UI
{
    /// <summary>Anti-aliased UI shapes generated at runtime (no imported sprite assets needed).</summary>
    public static class UISprites
    {
        static Sprite triangle, circle, diamond, ring, softCircle;

        public static Sprite Triangle => triangle ? triangle : triangle = Make(64, (x, y) =>
        {
            // pointing up, centred
            float px = x - 0.5f, py = y - 0.08f;
            float d1 = py;                                   // bottom edge
            float d2 = 0.86f - py - 1.75f * Mathf.Abs(px);   // sides
            return Mathf.Clamp01(Mathf.Min(d1, d2) * 40f);
        });

        public static Sprite Circle => circle ? circle : circle = Make(64, (x, y) => Mathf.Clamp01((0.47f - Vector2.Distance(new Vector2(x, y), new Vector2(0.5f, 0.5f))) * 60f));

        public static Sprite SoftCircle => softCircle ? softCircle : softCircle = Make(64, (x, y) =>
        {
            float d = Vector2.Distance(new Vector2(x, y), new Vector2(0.5f, 0.5f)) / 0.5f;
            return Mathf.Clamp01(1f - d) * Mathf.Clamp01(1f - d);
        });

        public static Sprite Diamond => diamond ? diamond : diamond = Make(64, (x, y) => Mathf.Clamp01((0.46f - (Mathf.Abs(x - 0.5f) + Mathf.Abs(y - 0.5f))) * 60f));

        public static Sprite Ring => ring ? ring : ring = Make(64, (x, y) =>
        {
            float d = Vector2.Distance(new Vector2(x, y), new Vector2(0.5f, 0.5f));
            return Mathf.Clamp01((0.47f - d) * 60f) * Mathf.Clamp01((d - 0.36f) * 60f);
        });

        static Sprite Make(int size, System.Func<float, float, float> alpha)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[size * size];
            for (int j = 0; j < size; j++)
                for (int i = 0; i < size; i++)
                    px[j * size + i] = new Color(1, 1, 1, alpha((i + 0.5f) / size, (j + 0.5f) / size));
            tex.SetPixels32(px); tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
        }
    }
}
