using UnityEngine;
using UnityEngine.Events;

namespace CombatSystem
{
    public interface IDamageable
    {
        void TakeDamage(int damage);
        bool IsDead();
    }

    public class Damageable : MonoBehaviour, IDamageable
    {
        [SerializeField] private int maxHealth = 100;
        [SerializeField] private int currentHealth;

        public UnityEvent<int> OnTakeDamage;
        public UnityEvent OnDeath;

        public int MaxHealth => maxHealth;
        public int CurrentHealth => currentHealth;

        private void Awake()
        {
            currentHealth = maxHealth;
        }

        public void TakeDamage(int damage)
        {
            if (IsDead()) return;

            currentHealth = Mathf.Max(0, currentHealth - damage);
            OnTakeDamage?.Invoke(damage);

            if (IsDead())
            {
                Die();
            }
        }

        public void Heal(int amount)
        {
            currentHealth = Mathf.Min(maxHealth, currentHealth + amount);
        }

        public bool IsDead()
        {
            return currentHealth <= 0;
        }

        private void Die()
        {
            OnDeath?.Invoke();
        }
    }
}
