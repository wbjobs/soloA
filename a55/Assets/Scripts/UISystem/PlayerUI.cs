using UnityEngine;
using UnityEngine.UI;

namespace UISystem
{
    public class PlayerUI : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private PlayerSystem.PlayerHealth playerHealth;
        [SerializeField] private PlayerSystem.PlayerStats playerStats;

        [Header("UI Elements")]
        [SerializeField] private Text healthText;
        [SerializeField] private Text levelText;
        [SerializeField] private Text experienceText;
        [SerializeField] private Slider experienceSlider;

        private void Start()
        {
            if (playerHealth != null)
            {
                playerHealth.OnHealthChanged += OnHealthChanged;
                UpdateHealthUI();
            }

            if (playerStats != null)
            {
                playerStats.OnLevelUp += OnLevelUp;
                playerStats.OnExperienceGained += OnExperienceGained;
                UpdateLevelUI();
                UpdateExperienceUI();
            }
        }

        private void OnDestroy()
        {
            if (playerHealth != null)
            {
                playerHealth.OnHealthChanged -= OnHealthChanged;
            }

            if (playerStats != null)
            {
                playerStats.OnLevelUp -= OnLevelUp;
                playerStats.OnExperienceGained -= OnExperienceGained;
            }
        }

        private void OnHealthChanged(int currentHealth)
        {
            UpdateHealthUI();
        }

        private void OnLevelUp()
        {
            UpdateLevelUI();
            UpdateExperienceUI();
        }

        private void OnExperienceGained(int amount)
        {
            UpdateExperienceUI();
        }

        private void UpdateHealthUI()
        {
            if (playerHealth != null && healthText != null)
            {
                healthText.text = $"{playerHealth.CurrentHealth} / {playerHealth.MaxHealth}";
            }
        }

        private void UpdateLevelUI()
        {
            if (playerStats != null && levelText != null)
            {
                levelText.text = $"Level: {playerStats.Level}";
            }
        }

        private void UpdateExperienceUI()
        {
            if (playerStats == null) return;

            if (experienceText != null)
            {
                experienceText.text = $"{playerStats.Experience} / {playerStats.ExperienceToNextLevel}";
            }

            if (experienceSlider != null)
            {
                experienceSlider.maxValue = playerStats.ExperienceToNextLevel;
                experienceSlider.value = playerStats.Experience;
            }
        }
    }
}
