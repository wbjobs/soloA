using UnityEngine;
using UnityEngine.UI;

namespace UISystem
{
    public class HealthBar : MonoBehaviour
    {
        [SerializeField] private Image healthBarFill;
        [SerializeField] private Image healthBarBackground;

        private int maxHealth;
        private int currentHealth;

        public void SetMaxHealth(int health)
        {
            maxHealth = health;
            currentHealth = health;
            UpdateHealthBar();
        }

        public void SetCurrentHealth(int health)
        {
            currentHealth = health;
            UpdateHealthBar();
        }

        private void UpdateHealthBar()
        {
            if (healthBarFill != null)
            {
                float healthPercent = (float)currentHealth / maxHealth;
                healthBarFill.fillAmount = healthPercent;
            }
        }
    }
}
