using UnityEngine;

namespace EnemyAISystem
{
    [RequireComponent(typeof(Rigidbody2D))]
    [RequireComponent(typeof(Collider2D))]
    public class EnemyAI : MonoBehaviour
    {
        [Header("Movement Settings")]
        [SerializeField] private float moveSpeed = 3f;
        [SerializeField] private float detectionRange = 8f;
        [SerializeField] private float attackRange = 2f;
        [SerializeField] private float obstacleCheckDistance = 1f;
        [SerializeField] private float stuckThreshold = 0.1f;
        [SerializeField] private float stuckTimeThreshold = 1f;
        [SerializeField] private LayerMask obstacleLayer;

        [Header("Health Settings")]
        [SerializeField] private int maxHealth = 100;
        private int currentHealth;

        [Header("Damage Settings")]
        [SerializeField] private int attackDamage = 10;

        [Header("Target Layer")]
        [SerializeField] private LayerMask playerLayer;

        [Header("Coordination")]
        [SerializeField] private bool useCoordination = true;

        private EnemyStateMachine stateMachine;
        private Transform playerTransform;
        private Rigidbody2D rb;
        private Animator animator;
        private Collider2D col;

        private Vector2 lastPosition;
        private float stuckTimer;
        private Vector2 avoidanceDirection;
        private float avoidanceTimer;

        public Vector2 PlayerPosition => playerTransform != null ? (Vector2)playerTransform.position : Vector2.zero;
        public int CurrentHealth => currentHealth;
        public int MaxHealth => maxHealth;
        public float MoveSpeed => moveSpeed;
        public LayerMask ObstacleLayer => obstacleLayer;
        public bool UseCoordination => useCoordination;

        private void Awake()
        {
            stateMachine = new EnemyStateMachine(this);
            rb = GetComponent<Rigidbody2D>();
            col = GetComponent<Collider2D>();
            animator = GetComponent<Animator>();
            currentHealth = maxHealth;
        }

        private void Start()
        {
            GameObject player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
            {
                playerTransform = player.transform;
            }

            stateMachine.Initialize(EnemyStateType.Patrolling);
            lastPosition = transform.position;

            if (useCoordination && EnemyCoordinator.Instance != null)
            {
                EnemyCoordinator.Instance.RegisterEnemy(this);
            }
        }

        private void OnDestroy()
        {
            if (EnemyCoordinator.Instance != null)
            {
                EnemyCoordinator.Instance.UnregisterEnemy(this);
            }
        }

        private void Update()
        {
            if (playerTransform == null)
            {
                GameObject player = GameObject.FindGameObjectWithTag("Player");
                if (player != null)
                {
                    playerTransform = player.transform;
                }
                return;
            }

            UpdateStuckDetection();
            stateMachine.Update();
            UpdateAnimation();
        }

        private void UpdateStuckDetection()
        {
            float distanceMoved = Vector2.Distance(transform.position, lastPosition);

            if (distanceMoved < stuckThreshold)
            {
                stuckTimer += Time.deltaTime;
            }
            else
            {
                stuckTimer = 0f;
            }

            lastPosition = transform.position;

            if (avoidanceTimer > 0)
            {
                avoidanceTimer -= Time.deltaTime;
            }
        }

        public bool IsStuck()
        {
            return stuckTimer >= stuckTimeThreshold;
        }

        public void ResetStuckTimer()
        {
            stuckTimer = 0f;
        }

        public bool IsPlayerInDetectionRange()
        {
            if (playerTransform == null) return false;
            float distance = Vector2.Distance(transform.position, playerTransform.position);
            return distance <= detectionRange;
        }

        public bool IsPlayerInAttackRange()
        {
            if (playerTransform == null) return false;
            float distance = Vector2.Distance(transform.position, playerTransform.position);
            return distance <= attackRange;
        }

        public bool HasLineOfSightToPlayer()
        {
            if (playerTransform == null) return false;

            Vector2 direction = (Vector2)playerTransform.position - (Vector2)transform.position;
            float distance = direction.magnitude;

            RaycastHit2D hit = Physics2D.Raycast(
                transform.position,
                direction.normalized,
                distance,
                obstacleLayer
            );

            return hit.collider == null;
        }

        public void MoveTowards(Vector2 target)
        {
            Vector2 direction = (target - (Vector2)transform.position).normalized;

            if (avoidanceTimer > 0 && avoidanceDirection != Vector2.zero)
            {
                direction = Vector2.Lerp(direction, avoidanceDirection, 0.7f).normalized;
            }
            else
            {
                Vector2 obstacleAvoidance = CalculateObstacleAvoidance();
                if (obstacleAvoidance != Vector2.zero)
                {
                    direction = Vector2.Lerp(direction, obstacleAvoidance, 0.5f).normalized;
                }
            }

            rb.velocity = direction * moveSpeed;
        }

        public void MoveInRandomDirection()
        {
            if (avoidanceTimer <= 0)
            {
                avoidanceDirection = Random.insideUnitCircle.normalized;
                avoidanceTimer = 1.5f;
            }

            rb.velocity = avoidanceDirection * moveSpeed * 0.8f;
        }

        private Vector2 CalculateObstacleAvoidance()
        {
            Vector2 avoidance = Vector2.zero;
            int rayCount = 8;
            float angleStep = 360f / rayCount;

            for (int i = 0; i < rayCount; i++)
            {
                float angle = i * angleStep * Mathf.Deg2Rad;
                Vector2 direction = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));

                RaycastHit2D hit = Physics2D.Raycast(
                    transform.position,
                    direction,
                    obstacleCheckDistance,
                    obstacleLayer
                );

                if (hit.collider != null)
                {
                    float distance = hit.distance;
                    float weight = 1f / (distance + 0.1f);
                    avoidance -= direction * weight;
                }
            }

            return avoidance.normalized;
        }

        public void PerformAttack()
        {
            if (playerTransform == null) return;

            RaycastHit2D hit = Physics2D.CircleCast(
                transform.position,
                attackRange,
                Vector2.zero,
                0f,
                playerLayer
            );

            if (hit.collider != null)
            {
                PlayerSystem.PlayerHealth playerHealth = hit.collider.GetComponent<PlayerSystem.PlayerHealth>();
                if (playerHealth != null)
                {
                    playerHealth.TakeDamage(attackDamage);
                }
            }
        }

        public void TakeDamage(int damage)
        {
            currentHealth -= damage;
            stateMachine.ChangeState(EnemyStateType.Hit);
        }

        public bool IsDead()
        {
            return currentHealth <= 0;
        }

        public void PlayHitAnimation()
        {
            if (animator != null)
            {
                animator.SetTrigger("Hit");
            }
        }

        public void PlayDeathAnimation()
        {
            if (animator != null)
            {
                animator.SetBool("IsDead", true);
            }
        }

        public Vector2 GetCoordinatedTargetPosition()
        {
            if (!useCoordination || EnemyCoordinator.Instance == null)
            {
                return PlayerPosition;
            }

            return EnemyCoordinator.Instance.GetFlankingTargetPosition(this, PlayerPosition);
        }

        public EnemyCoordinator.FlankingPosition GetCurrentFlankPosition()
        {
            if (!useCoordination || EnemyCoordinator.Instance == null)
            {
                return EnemyCoordinator.FlankingPosition.None;
            }

            return EnemyCoordinator.Instance.GetFlankingPosition(this);
        }

        public void DisableCollider()
        {
            if (col != null)
            {
                col.enabled = false;
            }
            rb.velocity = Vector2.zero;
        }

        private void UpdateAnimation()
        {
            if (animator != null)
            {
                float speed = rb.velocity.magnitude;
                animator.SetFloat("Speed", speed);
            }
        }

        public void SetStats(int health, int damage, float speed)
        {
            maxHealth = health;
            currentHealth = maxHealth;
            attackDamage = damage;
            moveSpeed = speed;
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(transform.position, detectionRange);
            Gizmos.color = Color.red;
            Gizmos.DrawWireSphere(transform.position, attackRange);
            Gizmos.color = Color.cyan;
            Gizmos.DrawWireSphere(transform.position, obstacleCheckDistance);
        }
    }
}
