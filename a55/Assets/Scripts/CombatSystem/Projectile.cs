using UnityEngine;

namespace CombatSystem
{
    [RequireComponent(typeof(Collider2D))]
    public class Projectile : MonoBehaviour
    {
        [SerializeField] private int damage = 10;
        [SerializeField] private float speed = 10f;
        [SerializeField] private float lifetime = 3f;
        [SerializeField] private LayerMask targetLayer;

        private Rigidbody2D rb;
        private float lifetimeTimer;

        private void Awake()
        {
            rb = GetComponent<Rigidbody2D>();
        }

        private void Start()
        {
            lifetimeTimer = lifetime;
        }

        private void Update()
        {
            lifetimeTimer -= Time.deltaTime;
            if (lifetimeTimer <= 0)
            {
                Destroy(gameObject);
            }
        }

        public void SetDirection(Vector2 direction)
        {
            if (rb != null)
            {
                rb.velocity = direction.normalized * speed;
            }
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            if ((targetLayer.value & (1 << other.gameObject.layer)) != 0)
            {
                IDamageable damageable = other.GetComponent<IDamageable>();
                if (damageable != null)
                {
                    damageable.TakeDamage(damage);
                }

                EnemyAISystem.EnemyAI enemy = other.GetComponent<EnemyAISystem.EnemyAI>();
                if (enemy != null)
                {
                    enemy.TakeDamage(damage);
                }

                Destroy(gameObject);
            }
        }
    }
}
