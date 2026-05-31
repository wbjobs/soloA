using UnityEngine;

namespace DungeonSystem
{
    public enum DungeonThemeType
    {
        Dungeon,
        IceCave,
        Lava,
        Forest,
        Crystal
    }

    [CreateAssetMenu(fileName = "DungeonTheme", menuName = "Dungeon/Dungeon Theme")]
    public class DungeonTheme : ScriptableObject
    {
        [Header("Theme Info")]
        public DungeonThemeType ThemeType;
        public string ThemeName;
        public Color AmbientColor = Color.white;

        [Header("Tiles")]
        public GameObject FloorTilePrefab;
        public GameObject WallTilePrefab;
        public GameObject CorridorTilePrefab;

        [Header("Environment Effects")]
        public GameObject FogParticlePrefab;
        public Light SceneLight;
        public Color LightColor = Color.white;
        public float LightIntensity = 1f;

        [Header("Enemy Skin Overrides")]
        public Material NormalEnemyMaterial;
        public Material EliteEnemyMaterial;
        public Material BossEnemyMaterial;

        [Header("Floor Range")]
        public int StartFloor = 1;
        public int EndFloor = 999;
    }
}
