using UnityEngine;
using UnityEngine.InputSystem;

namespace Cinderfall.Core
{
    /// <summary>
    /// All player input actions, defined in code so bindings are explicit and remappable.
    /// Binding overrides are persisted as JSON in PlayerPrefs.
    /// </summary>
    public static class GameInput
    {
        const string PrefsKey = "cf.bindings";
        static InputActionMap map;

        public static InputAction Move, Look, Jump, Sprint, Interact, Flashlight, Pda, Pause, Brake, ResetVehicle, Crouch;

        public static InputActionMap Map { get { Init(); return map; } }

        /// <summary>Actions the player may rebind (shown in the Controls menu).</summary>
        public static InputAction[] Rebindable
        {
            get { Init(); return new[] { Interact, Flashlight, Pda, Jump, Sprint, Crouch, ResetVehicle }; }
        }

        public static void Init()
        {
            if (map != null) return;
            map = new InputActionMap("Player");

            Move = map.AddAction("Move", InputActionType.Value);
            Move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            Move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow").With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow").With("Right", "<Keyboard>/rightArrow");
            Move.AddBinding("<Gamepad>/leftStick");

            Look = map.AddAction("Look", InputActionType.Value);
            Look.AddBinding("<Mouse>/delta");
            Look.AddBinding("<Gamepad>/rightStick").WithProcessor("scaleVector2(x=12,y=12)");

            Jump = map.AddAction("Jump", InputActionType.Button, "<Keyboard>/space");
            Jump.AddBinding("<Gamepad>/buttonSouth");
            Sprint = map.AddAction("Sprint", InputActionType.Button, "<Keyboard>/leftShift");
            Sprint.AddBinding("<Gamepad>/leftStickPress");
            Crouch = map.AddAction("Crouch", InputActionType.Button, "<Keyboard>/leftCtrl");
            Crouch.AddBinding("<Gamepad>/buttonEast");
            Interact = map.AddAction("Interact", InputActionType.Button, "<Keyboard>/e");
            Interact.AddBinding("<Gamepad>/buttonWest");
            Flashlight = map.AddAction("Flashlight", InputActionType.Button, "<Keyboard>/f");
            Flashlight.AddBinding("<Gamepad>/dpad/up");
            Pda = map.AddAction("PDA", InputActionType.Button, "<Keyboard>/tab");
            Pda.AddBinding("<Gamepad>/select");
            Pause = map.AddAction("Pause", InputActionType.Button, "<Keyboard>/escape");
            Pause.AddBinding("<Gamepad>/start");
            Brake = map.AddAction("Brake", InputActionType.Button, "<Keyboard>/space");
            Brake.AddBinding("<Gamepad>/buttonSouth");
            ResetVehicle = map.AddAction("ResetVehicle", InputActionType.Button, "<Keyboard>/r");
            ResetVehicle.AddBinding("<Gamepad>/buttonNorth");

            string json = PlayerPrefs.GetString(PrefsKey, "");
            if (!string.IsNullOrEmpty(json))
            {
                try { map.LoadBindingOverridesFromJson(json); }
                catch { Debug.LogWarning("[Cinderfall] Ignoring corrupt binding overrides."); }
            }
            map.Enable();
        }

        public static void SaveBindings()
        {
            PlayerPrefs.SetString(PrefsKey, map.SaveBindingOverridesAsJson());
            PlayerPrefs.Save();
        }

        public static void ResetBindings()
        {
            map.RemoveAllBindingOverrides();
            PlayerPrefs.DeleteKey(PrefsKey);
        }

        /// <summary>Human readable binding for the keyboard/mouse scheme.</summary>
        public static string Display(InputAction action)
        {
            if (action == null) return "?";
            for (int i = 0; i < action.bindings.Count; i++)
            {
                var b = action.bindings[i];
                if (b.isComposite || b.isPartOfComposite) continue;
                string path = b.effectivePath ?? "";
                if (path.StartsWith("<Keyboard>") || path.StartsWith("<Mouse>"))
                    return action.GetBindingDisplayString(i).ToUpperInvariant();
            }
            return action.GetBindingDisplayString().ToUpperInvariant();
        }

        public static int KeyboardBindingIndex(InputAction action)
        {
            for (int i = 0; i < action.bindings.Count; i++)
            {
                var b = action.bindings[i];
                if (b.isComposite || b.isPartOfComposite) continue;
                string path = b.effectivePath ?? "";
                if (path.StartsWith("<Keyboard>") || path.StartsWith("<Mouse>")) return i;
            }
            return 0;
        }
    }
}
