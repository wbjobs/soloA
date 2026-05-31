using UnityEngine;

namespace PlayerSystem
{
    public class PlayerStats : MonoBehaviour
    {
        [Header("Player Level Stats")]
        [SerializeField] private int level = 1;
        [SerializeField] private int experience = 0;
        [SerializeField] private int experienceToNextLevel = 100;

        [Header("Combat Stats")]
        [SerializeField] private int baseDamage = 20;
        [SerializeField] private float attackSpeed = 1f;
        [SerializeField] private float attackRange = 1.5f;

        public int Level => level;
        public int Experience => experience;
        public int ExperienceToNextLevel => experienceToNextLevel;
        public int BaseDamage => baseDamage;
        public float AttackSpeed => attackSpeed;
        public float AttackRange => attackRange;

        public System.Action OnLevelUp;
        public System.Action<int> OnExperienceGained;

        public void AddExperience(int amount)
        {
            experience += amount;
            OnExperienceGained?.Invoke(amount);

            while (experience >= experienceToNextLevel)
            {
                LevelUp();
            }
        }

        private void LevelUp()
        {
            experience -= experienceToNextLevel;
            level++;
            experienceToNextLevel = Mathf.RoundToInt(experienceToNextLevel * 1.5f);
            baseDamage += 5;

            OnLevelUp?.Invoke();

            if (DifficultySystem.DifficultyManager.Instance != null)
            {
                DifficultySystem.DifficultyManager.Instance.PlayerLevel = level;
            }
        }

        public int GetAttackDamage()
        {
            return baseDamage + (level - 1) * 5;
        }
    }
}
