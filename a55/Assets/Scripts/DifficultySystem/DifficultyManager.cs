using UnityEngine;

namespace DifficultySystem
{
    [System.Serializable]
    public class EnemyDifficultyData
    {
        public int BaseHealth;
        public int BaseDamage;
        public float BaseSpeed;
        public float HealthMultiplierPerLevel = 0.15f;
        public float DamageMultiplierPerLevel = 0.1f;
        public float SpeedMultiplierPerLevel = 0.05f;
        public float HealthMultiplierPerFloor = 0.2f;
        public float DamageMultiplierPerFloor = 0.15f;
        public float SpeedMultiplierPerFloor = 0.03f;
    }

    public class DifficultyManager : MonoBehaviour
    {
        public static DifficultyManager Instance;

        [Header("Player Stats")]
        [SerializeField] private int playerLevel = 1;
        [SerializeField] private int currentFloor = 1;

        [Header("Enemy Data")]
        [SerializeField] private EnemyDifficultyData normalEnemyData = new EnemyDifficultyData
        {
            BaseHealth = 100,
            BaseDamage = 10,
            BaseSpeed = 3f
        };

        [SerializeField] private EnemyDifficultyData eliteEnemyData = new EnemyDifficultyData
        {
            BaseHealth = 200,
            BaseDamage = 20,
            BaseSpeed = 3.5f
        };

        [SerializeField] private EnemyDifficultyData bossEnemyData = new EnemyDifficultyData
        {
            BaseHealth = 500,
            BaseDamage = 35,
            BaseSpeed = 2.5f
        };

        public int PlayerLevel
        {
            get => playerLevel;
            set => playerLevel = Mathf.Max(1, value);
        }

        public int CurrentFloor
        {
            get => currentFloor;
            set => currentFloor = Mathf.Max(1, value);
        }

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
            }
        }

        public void CalculateEnemyStats(EnemyAISystem.EnemyAI enemy, bool isElite = false, bool isBoss = false)
        {
            EnemyDifficultyData data = isBoss ? bossEnemyData :
                                       isElite ? eliteEnemyData :
                                       normalEnemyData;

            float levelMultiplier = 1f + (PlayerLevel - 1) * data.HealthMultiplierPerLevel;
            float floorMultiplier = 1f + (CurrentFloor - 1) * data.HealthMultiplierPerFloor;
            int finalHealth = Mathf.RoundToInt(data.BaseHealth * levelMultiplier * floorMultiplier);

            float damageLevelMultiplier = 1f + (PlayerLevel - 1) * data.DamageMultiplierPerLevel;
            float damageFloorMultiplier = 1f + (CurrentFloor - 1) * data.DamageMultiplierPerFloor;
            int finalDamage = Mathf.RoundToInt(data.BaseDamage * damageLevelMultiplier * damageFloorMultiplier);

            float speedLevelMultiplier = 1f + (PlayerLevel - 1) * data.SpeedMultiplierPerLevel;
            float speedFloorMultiplier = 1f + (CurrentFloor - 1) * data.SpeedMultiplierPerFloor;
            float finalSpeed = data.BaseSpeed * speedLevelMultiplier * speedFloorMultiplier;

            enemy.SetStats(finalHealth, finalDamage, finalSpeed);
        }

        public (int health, int damage, float speed) GetEnemyStats(bool isElite = false, bool isBoss = false)
        {
            EnemyDifficultyData data = isBoss ? bossEnemyData :
                                       isElite ? eliteEnemyData :
                                       normalEnemyData;

            float levelMultiplier = 1f + (PlayerLevel - 1) * data.HealthMultiplierPerLevel;
            float floorMultiplier = 1f + (CurrentFloor - 1) * data.HealthMultiplierPerFloor;
            int finalHealth = Mathf.RoundToInt(data.BaseHealth * levelMultiplier * floorMultiplier);

            float damageLevelMultiplier = 1f + (PlayerLevel - 1) * data.DamageMultiplierPerLevel;
            float damageFloorMultiplier = 1f + (CurrentFloor - 1) * data.DamageMultiplierPerFloor;
            int finalDamage = Mathf.RoundToInt(data.BaseDamage * damageLevelMultiplier * damageFloorMultiplier);

            float speedLevelMultiplier = 1f + (PlayerLevel - 1) * data.SpeedMultiplierPerLevel;
            float speedFloorMultiplier = 1f + (CurrentFloor - 1) * data.SpeedMultiplierPerFloor;
            float finalSpeed = data.BaseSpeed * speedLevelMultiplier * speedFloorMultiplier;

            return (finalHealth, finalDamage, finalSpeed);
        }
    }
}
