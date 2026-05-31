using UnityEngine;

namespace EnemyAISystem
{
    public class EnemyAnimationController : MonoBehaviour
    {
        private Animator animator;
        private EnemyAI enemyAI;
        private SpriteRenderer spriteRenderer;

        private void Awake()
        {
            animator = GetComponent<Animator>();
            enemyAI = GetComponent<EnemyAI>();
            spriteRenderer = GetComponent<SpriteRenderer>();
        }

        private void Update()
        {
            UpdateFacingDirection();
        }

        private void UpdateFacingDirection()
        {
            if (enemyAI == null || spriteRenderer == null) return;

            if (enemyAI.PlayerPosition != Vector2.zero)
            {
                float playerX = enemyAI.PlayerPosition.x;
                float myX = transform.position.x;

                if (playerX < myX)
                {
                    spriteRenderer.flipX = true;
                }
                else if (playerX > myX)
                {
                    spriteRenderer.flipX = false;
                }
            }
        }
    }
}
