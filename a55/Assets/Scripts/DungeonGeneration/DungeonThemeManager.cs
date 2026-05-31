using System.Collections.Generic;
using UnityEngine;

namespace DungeonSystem
{
    public class DungeonThemeManager : MonoBehaviour
    {
        public static DungeonThemeManager Instance;

        [Header("Themes")]
        [SerializeField] private List<DungeonTheme> availableThemes = new List<DungeonTheme>();
        [SerializeField] private DungeonTheme defaultTheme;

        [Header("Current Theme")]
        [SerializeField] private DungeonThemeType currentThemeType;
        private DungeonTheme currentTheme;

        public DungeonTheme CurrentTheme => currentTheme;
        public DungeonThemeType CurrentThemeType => currentThemeType;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
                return;
            }

            if (defaultTheme != null)
            {
                SetTheme(defaultTheme.ThemeType);
            }
        }

        public void SetThemeForFloor(int floorNumber)
        {
            DungeonTheme selectedTheme = null;

            foreach (var theme in availableThemes)
            {
                if (floorNumber >= theme.StartFloor && floorNumber <= theme.EndFloor)
                {
                    selectedTheme = theme;
                    break;
                }
            }

            if (selectedTheme == null && defaultTheme != null)
            {
                selectedTheme = defaultTheme;
            }

            if (selectedTheme != null)
            {
                ApplyTheme(selectedTheme);
            }
        }

        public void SetTheme(DungeonThemeType themeType)
        {
            DungeonTheme theme = availableThemes.Find(t => t.ThemeType == themeType);
            if (theme == null && defaultTheme != null)
            {
                theme = defaultTheme;
            }

            if (theme != null)
            {
                ApplyTheme(theme);
            }
        }

        public void SetTheme(DungeonTheme theme)
        {
            if (theme != null)
            {
                ApplyTheme(theme);
            }
        }

        private void ApplyTheme(DungeonTheme theme)
        {
            currentTheme = theme;
            currentThemeType = theme.ThemeType;

            ApplyLighting(theme);
            ApplyAmbientColor(theme);
        }

        private void ApplyLighting(DungeonTheme theme)
        {
            if (theme.SceneLight != null)
            {
                theme.SceneLight.color = theme.LightColor;
                theme.SceneLight.intensity = theme.LightIntensity;
            }
            else
            {
                Light mainLight = FindObjectOfType<Light>();
                if (mainLight != null)
                {
                    mainLight.color = theme.LightColor;
                    mainLight.intensity = theme.LightIntensity;
                }
            }
        }

        private void ApplyAmbientColor(DungeonTheme theme)
        {
            RenderSettings.ambientLight = theme.AmbientColor;
        }

        public GameObject GetFloorTile()
        {
            if (currentTheme != null && currentTheme.FloorTilePrefab != null)
            {
                return currentTheme.FloorTilePrefab;
            }
            return null;
        }

        public GameObject GetWallTile()
        {
            if (currentTheme != null && currentTheme.WallTilePrefab != null)
            {
                return currentTheme.WallTilePrefab;
            }
            return null;
        }

        public GameObject GetCorridorTile()
        {
            if (currentTheme != null && currentTheme.CorridorTilePrefab != null)
            {
                return currentTheme.CorridorTilePrefab;
            }
            return GetFloorTile();
        }

        public Material GetEnemyMaterial(bool isElite = false, bool isBoss = false)
        {
            if (currentTheme == null) return null;

            if (isBoss && currentTheme.BossEnemyMaterial != null)
            {
                return currentTheme.BossEnemyMaterial;
            }
            if (isElite && currentTheme.EliteEnemyMaterial != null)
            {
                return currentTheme.EliteEnemyMaterial;
            }
            if (currentTheme.NormalEnemyMaterial != null)
            {
                return currentTheme.NormalEnemyMaterial;
            }

            return null;
        }

        public List<DungeonTheme> GetAllThemes()
        {
            return availableThemes;
        }

        public DungeonTheme GetThemeByType(DungeonThemeType type)
        {
            return availableThemes.Find(t => t.ThemeType == type);
        }
    }
}
