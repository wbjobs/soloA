using System.Collections.Generic;
using UnityEngine;

namespace EnemyAISystem
{
    public class EnemyCoordinator : MonoBehaviour
    {
        public static EnemyCoordinator Instance;

        [Header("Coordination Settings")]
        [SerializeField] private float flankingDistance = 3f;
        [SerializeField] private float clusterAvoidanceDistance = 2f;
        [SerializeField] private float coordinationUpdateInterval = 0.3f;
        [SerializeField] private int maxEnemiesChasing = 4;

        private List<EnemyAI> activeEnemies = new List<EnemyAI>();
        private Dictionary<EnemyAI, FlankingPosition> enemyFlankPositions = new Dictionary<EnemyAI, FlankingPosition>();
        private float coordinationTimer;

        public enum FlankingPosition
        {
            None,
            Front,
            Left,
            Right,
            Rear
        }

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
            }
            else
            {
                Destroy(gameObject);
            }
        }

        public void RegisterEnemy(EnemyAI enemy)
        {
            if (!activeEnemies.Contains(enemy))
            {
                activeEnemies.Add(enemy);
                enemyFlankPositions[enemy] = FlankingPosition.None;
            }
        }

        public void UnregisterEnemy(EnemyAI enemy)
        {
            activeEnemies.Remove(enemy);
            enemyFlankPositions.Remove(enemy);
        }

        private void Update()
        {
            coordinationTimer += Time.deltaTime;

            if (coordinationTimer >= coordinationUpdateInterval)
            {
                coordinationTimer = 0f;
                UpdateCoordination();
            }
        }

        private void UpdateCoordination()
        {
            if (activeEnemies.Count == 0) return;

            Transform player = FindPlayer();
            if (player == null) return;

            List<EnemyAI> chasingEnemies = GetChasingEnemies();

            if (chasingEnemies.Count <= 1) return;

            AssignFlankingPositions(chasingEnemies, player);
        }

        private Transform FindPlayer()
        {
            GameObject playerObj = GameObject.FindGameObjectWithTag("Player");
            return playerObj != null ? playerObj.transform : null;
        }

        private List<EnemyAI> GetChasingEnemies()
        {
            List<EnemyAI> chasers = new List<EnemyAI>();

            foreach (var enemy in activeEnemies)
            {
                if (enemy != null && enemy.IsPlayerInDetectionRange() && !enemy.IsDead())
                {
                    chasers.Add(enemy);
                }
            }

            return chasers;
        }

        private void AssignFlankingPositions(List<EnemyAI> chasers, Transform player)
        {
            if (chasers.Count == 0) return;

            chasers.Sort((a, b) =>
                Vector2.Distance(a.transform.position, player.position).CompareTo(
                Vector2.Distance(b.transform.position, player.position))
            );

            for (int i = 0; i < chasers.Count; i++)
            {
                FlankingPosition position;

                if (i == 0)
                {
                    position = FlankingPosition.Front;
                }
                else if (i == 1)
                {
                    position = FlankingPosition.Left;
                }
                else if (i == 2)
                {
                    position = FlankingPosition.Right;
                }
                else
                {
                    position = FlankingPosition.Rear;
                }

                enemyFlankPositions[chasers[i]] = position;
            }
        }

        public Vector2 GetFlankingTargetPosition(EnemyAI enemy, Vector2 playerPosition)
        {
            if (!enemyFlankPositions.ContainsKey(enemy))
            {
                return playerPosition;
            }

            FlankingPosition position = enemyFlankPositions[enemy];
            Vector2 targetPos = playerPosition;

            switch (position)
            {
                case FlankingPosition.Front:
                    targetPos = playerPosition + (GetPlayerForward() * flankingDistance * 0.5f);
                    break;
                case FlankingPosition.Left:
                    targetPos = playerPosition + (GetPlayerRight() * -flankingDistance);
                    break;
                case FlankingPosition.Right:
                    targetPos = playerPosition + (GetPlayerRight() * flankingDistance);
                    break;
                case FlankingPosition.Rear:
                    targetPos = playerPosition + (GetPlayerForward() * -flankingDistance);
                    break;
                case FlankingPosition.None:
                    targetPos = playerPosition;
                    break;
            }

            targetPos += GetClusterAvoidanceOffset(enemy);

            return targetPos;
        }

        private Vector2 GetPlayerForward()
        {
            return Vector2.down;
        }

        private Vector2 GetPlayerRight()
        {
            return Vector2.right;
        }

        private Vector2 GetClusterAvoidanceOffset(EnemyAI enemy)
        {
            Vector2 offset = Vector2.zero;
            Vector2 enemyPos = enemy.transform.position;

            foreach (var otherEnemy in activeEnemies)
            {
                if (otherEnemy == enemy || otherEnemy == null) continue;

                float distance = Vector2.Distance(enemyPos, (Vector2)otherEnemy.transform.position);

                if (distance < clusterAvoidanceDistance && distance > 0.1f)
                {
                    Vector2 awayDirection = (enemyPos - (Vector2)otherEnemy.transform.position).normalized;
                    float avoidanceStrength = (clusterAvoidanceDistance - distance) / clusterAvoidanceDistance;
                    offset += awayDirection * avoidanceStrength;
                }
            }

            return offset;
        }

        public FlankingPosition GetFlankingPosition(EnemyAI enemy)
        {
            if (enemyFlankPositions.ContainsKey(enemy))
            {
                return enemyFlankPositions[enemy];
            }
            return FlankingPosition.None;
        }

        public int GetActiveEnemyCount()
        {
            return activeEnemies.Count;
        }

        public int GetChasingEnemyCount()
        {
            return GetChasingEnemies().Count;
        }

        public void OnEnemyDeath(EnemyAI enemy)
        {
            UnregisterEnemy(enemy);
        }
    }
}
