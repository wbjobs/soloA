using UnityEngine;
using UnityEngine.InputSystem;

namespace PlayerSystem
{
    [RequireComponent(typeof(Rigidbody2D))]
    public class PlayerController : MonoBehaviour
    {
        [Header("Movement Settings")]
        [SerializeField] private float moveSpeed = 5f;

        [Header("References")]
        [SerializeField] private PlayerStats playerStats;

        private Rigidbody2D rb;
        private Vector2 moveInput;
        private float attackTimer;
        private bool isAttacking;

        private void Awake()
        {
            rb = GetComponent<Rigidbody2D>();
            if (playerStats == null)
                playerStats = GetComponent<PlayerStats>();
        }

        private void Update()
        {
            if (isAttacking)
            {
                attackTimer += Time.deltaTime;
                if (attackTimer >= 1f / playerStats.AttackSpeed)
                {
                    isAttacking = false;
                }
            }
        }

        private void FixedUpdate()
        {
            Move();
        }

        private void OnMove(InputValue value)
        {
            moveInput = value.Get<Vector2>();
        }

        private void Move()
        {
            rb.velocity = moveInput.normalized * moveSpeed;
        }

        private void OnAttack()
        {
            if (isAttacking) return;

            isAttacking = true;
            attackTimer = 0f;
            PerformAttack();
        }

        private void PerformAttack()
        {
            Collider2D[] hitEnemies = Physics2D.OverlapCircleAll(
                transform.position,
                playerStats.AttackRange,
                LayerMask.GetMask("Enemy")
            );

            int damage = playerStats.GetAttackDamage();

            foreach (var enemy in hitEnemies)
            {
                EnemyAISystem.EnemyAI enemyAI = enemy.GetComponent<EnemyAISystem.EnemyAI>();
                if (enemyAI != null)
                {
                    enemyAI.TakeDamage(damage);
                }
            }
        }

        private void OnDrawGizmosSelected()
        {
            if (playerStats != null)
            {
                Gizmos.color = Color.blue;
                Gizmos.DrawWireSphere(transform.position, playerStats.AttackRange);
            }
        }
    }
}
