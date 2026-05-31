using UnityEngine;
using UnityEngine.Events;

namespace PlayerSystem
{
    public class PlayerHealth : MonoBehaviour
    {
        [SerializeField] private int maxHealth = 100;
        [SerializeField] private int currentHealth;
        [SerializeField] private float invulnerabilityDuration = 1f;

        private bool isInvulnerable;
        private float invulnerabilityTimer;

        public int MaxHealth => maxHealth;
        public int CurrentHealth => currentHealth;
        public bool IsDead => currentHealth <= 0;

        public UnityEvent OnDeath;
        public UnityEvent<int> OnHealthChanged;

        private void Awake()
        {
            currentHealth = maxHealth;
        }

        private void Update()
        {
            if (isInvulnerable)
            {
                invulnerabilityTimer -= Time.deltaTime;
                if (invulnerabilityTimer <= 0)
                {
                    isInvulnerable = false;
                }
            }
        }

        public void TakeDamage(int damage)
        {
            if (isInvulnerable || IsDead) return;

            currentHealth = Mathf.Max(0, currentHealth - damage);
            OnHealthChanged?.Invoke(currentHealth);
            StartInvulnerability();

            if (IsDead)
            {
                Die();
            }
        }

        public void Heal(int amount)
        {
            currentHealth = Mathf.Min(maxHealth, currentHealth + amount);
            OnHealthChanged?.Invoke(currentHealth);
        }

        private void StartInvulnerability()
        {
            isInvulnerable = true;
            invulnerabilityTimer = invulnerabilityDuration;
        }

        private void Die()
        {
            OnDeath?.Invoke();
            Debug.Log("Player died!");
        }
    }
}
