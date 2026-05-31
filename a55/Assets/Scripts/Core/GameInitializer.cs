using UnityEngine;

namespace Core
{
    public class GameInitializer : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void OnBeforeSceneLoad()
        {
            Debug.Log("Game initializing...");
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void OnAfterSceneLoad()
        {
            InitializeManagers();
        }

        static void InitializeManagers()
        {
            if (DifficultySystem.DifficultyManager.Instance == null)
            {
                GameObject managerObject = new GameObject("DifficultyManager");
                managerObject.AddComponent<DifficultySystem.DifficultyManager>();
            }
        }
    }
}
