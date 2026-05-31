using System.Collections.Generic;
using UnityEngine;
using DungeonSystem;

namespace GameSystem
{
    public class GameManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private DungeonGenerator dungeonGenerator;
        [SerializeField] private Transform playerTransform;
        [SerializeField] private GameObject enemyPrefab;
        [SerializeField] private GameObject eliteEnemyPrefab;
        [SerializeField] private GameObject bossPrefab;

        [Header("Settings")]
        [SerializeField] private int enemiesPerRoom = 2;
        [SerializeField] private float enemySpawnMargin = 2f;

        private List<GameObject> spawnedEnemies = new List<GameObject>();
        private int currentFloor = 1;

        public int CurrentFloor => currentFloor;

        private void Start()
        {
            StartNewFloor();
        }

        public void StartNewFloor()
        {
            ClearFloor();
            GenerateFloor();
        }

        private void GenerateFloor()
        {
            if (dungeonGenerator != null)
            {
                if (DungeonThemeManager.Instance != null)
                {
                    DungeonThemeManager.Instance.SetThemeForFloor(currentFloor);
                }

                dungeonGenerator.GenerateDungeon();
                SpawnPlayer();
                SpawnEnemies();

                if (DifficultySystem.DifficultyManager.Instance != null)
                {
                    DifficultySystem.DifficultyManager.Instance.CurrentFloor = currentFloor;
                }
            }
        }

        private void ClearFloor()
        {
            foreach (var enemy in spawnedEnemies)
            {
                if (enemy != null)
                    Destroy(enemy);
            }
            spawnedEnemies.Clear();

            currentFloor++;
        }

        private void SpawnPlayer()
        {
            if (playerTransform != null && dungeonGenerator != null)
            {
                RoomData startRoom = dungeonGenerator.GetStartRoom();
                if (startRoom != null)
                {
                    playerTransform.position = new Vector3(
                        startRoom.Center.x,
                        startRoom.Center.y,
                        0
                    );
                }
            }
        }

        private void SpawnEnemies()
        {
            if (dungeonGenerator == null) return;

            foreach (var room in dungeonGenerator.Rooms)
            {
                if (room.Type == RoomType.Start) continue;

                if (room.Type == RoomType.Enemy || room.Type == RoomType.Normal)
                {
                    SpawnNormalEnemies(room);
                }
                else if (room.Type == RoomType.Treasure)
                {
                    SpawnEliteEnemy(room);
                }
                else if (room.Type == RoomType.Boss)
                {
                    SpawnBoss(room);
                }
            }
        }

        private void SpawnNormalEnemies(RoomData room)
        {
            if (enemyPrefab == null) return;

            int enemyCount = Random.Range(1, enemiesPerRoom + 1);

            for (int i = 0; i < enemyCount; i++)
            {
                Vector2 spawnPos = GetRandomPositionInRoom(room);
                GameObject enemy = Instantiate(enemyPrefab, new Vector3(spawnPos.x, spawnPos.y, 0), Quaternion.identity);

                ConfigureEnemy(enemy, false, false);
                spawnedEnemies.Add(enemy);
            }
        }

        private void SpawnEliteEnemy(RoomData room)
        {
            GameObject prefab = eliteEnemyPrefab != null ? eliteEnemyPrefab : enemyPrefab;
            if (prefab == null) return;

            Vector2 spawnPos = GetRandomPositionInRoom(room);
            GameObject enemy = Instantiate(prefab, new Vector3(spawnPos.x, spawnPos.y, 0), Quaternion.identity);

            ConfigureEnemy(enemy, true, false);
            spawnedEnemies.Add(enemy);
        }

        private void SpawnBoss(RoomData room)
        {
            GameObject prefab = bossPrefab != null ? bossPrefab : eliteEnemyPrefab != null ? eliteEnemyPrefab : enemyPrefab;
            if (prefab == null) return;

            Vector2 spawnPos = GetRandomPositionInRoom(room);
            GameObject boss = Instantiate(prefab, new Vector3(spawnPos.x, spawnPos.y, 0), Quaternion.identity);

            ConfigureEnemy(boss, false, true);
            spawnedEnemies.Add(boss);
        }

        private void ConfigureEnemy(GameObject enemy, bool isElite, bool isBoss)
        {
            EnemyAISystem.EnemyAI enemyAI = enemy.GetComponent<EnemyAISystem.EnemyAI>();
            if (enemyAI != null && DifficultySystem.DifficultyManager.Instance != null)
            {
                DifficultySystem.DifficultyManager.Instance.CalculateEnemyStats(enemyAI, isElite, isBoss);
            }

            if (DungeonThemeManager.Instance != null)
            {
                Material enemyMaterial = DungeonThemeManager.Instance.GetEnemyMaterial(isElite, isBoss);
                if (enemyMaterial != null)
                {
                    SpriteRenderer renderer = enemy.GetComponentInChildren<SpriteRenderer>();
                    if (renderer != null)
                    {
                        renderer.material = enemyMaterial;
                    }
                }
            }
        }

        private Vector2 GetRandomPositionInRoom(RoomData room)
        {
            float minX = room.Position.x + enemySpawnMargin;
            float maxX = room.Position.x + room.Size.x - enemySpawnMargin;
            float minY = room.Position.y + enemySpawnMargin;
            float maxY = room.Position.y + room.Size.y - enemySpawnMargin;

            return new Vector2(
                Random.Range(minX, maxX),
                Random.Range(minY, maxY)
            );
        }
    }
}
