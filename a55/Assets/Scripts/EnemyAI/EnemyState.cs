using UnityEngine;

namespace EnemyAISystem
{
    public enum EnemyStateType
    {
        Patrolling,
        Chasing,
        Attacking,
        Hit,
        Dead
    }

    public abstract class EnemyState
    {
        protected EnemyStateMachine stateMachine;
        protected EnemyAI enemy;

        public EnemyState(EnemyStateMachine stateMachine, EnemyAI enemy)
        {
            this.stateMachine = stateMachine;
            this.enemy = enemy;
        }

        public abstract void Enter();
        public abstract void Update();
        public abstract void Exit();
    }

    public class PatrolState : EnemyState
    {
        private Vector2 patrolTarget;
        private float patrolTimer;
        private float patrolDuration = 3f;

        public PatrolState(EnemyStateMachine stateMachine, EnemyAI enemy) 
            : base(stateMachine, enemy) { }

        public override void Enter()
        {
            FindNewPatrolTarget();
        }

        public override void Update()
        {
            if (enemy.IsPlayerInDetectionRange())
            {
                stateMachine.ChangeState(EnemyStateType.Chasing);
                return;
            }

            patrolTimer += Time.deltaTime;
            if (patrolTimer >= patrolDuration)
            {
                FindNewPatrolTarget();
                patrolTimer = 0f;
            }

            if (enemy.IsStuck())
            {
                enemy.ResetStuckTimer();
                FindNewPatrolTarget();
            }

            enemy.MoveTowards(patrolTarget);
        }

        public override void Exit() { }

        private void FindNewPatrolTarget()
        {
            Vector2 randomOffset = Random.insideUnitCircle * 5f;
            patrolTarget = (Vector2)enemy.transform.position + randomOffset;
        }
    }

    public class ChaseState : EnemyState
    {
        private float pathUpdateTimer;
        private float pathUpdateInterval = 0.5f;
        private Vector2 currentPathTarget;
        private float coordinationInterval = 0.3f;
        private float coordinationTimer;

        public ChaseState(EnemyStateMachine stateMachine, EnemyAI enemy) 
            : base(stateMachine, enemy) { }

        public override void Enter()
        {
            pathUpdateTimer = 0f;
            coordinationTimer = 0f;
            currentPathTarget = enemy.GetCoordinatedTargetPosition();
        }

        public override void Update()
        {
            if (!enemy.IsPlayerInDetectionRange())
            {
                stateMachine.ChangeState(EnemyStateType.Patrolling);
                return;
            }

            if (enemy.IsPlayerInAttackRange())
            {
                stateMachine.ChangeState(EnemyStateType.Attacking);
                return;
            }

            pathUpdateTimer += Time.deltaTime;
            coordinationTimer += Time.deltaTime;

            if (enemy.IsStuck())
            {
                enemy.ResetStuckTimer();
                enemy.MoveInRandomDirection();
                return;
            }

            if (coordinationTimer >= coordinationInterval)
            {
                coordinationTimer = 0f;
                currentPathTarget = enemy.GetCoordinatedTargetPosition();
            }

            if (pathUpdateTimer >= pathUpdateInterval)
            {
                pathUpdateTimer = 0f;
                UpdatePathTarget();
            }

            enemy.MoveTowards(currentPathTarget);
        }

        public override void Exit() { }

        private void UpdatePathTarget()
        {
            Vector2 playerPos = enemy.PlayerPosition;
            Vector2 enemyPos = enemy.transform.position;
            Vector2 directionToPlayer = (playerPos - enemyPos).normalized;

            Vector2 coordinatedTarget = enemy.GetCoordinatedTargetPosition();
            float distanceToCoordinatedTarget = Vector2.Distance(enemyPos, coordinatedTarget);

            if (distanceToCoordinatedTarget < 1.5f)
            {
                if (enemy.HasLineOfSightToPlayer())
                {
                    currentPathTarget = playerPos;
                    return;
                }
            }

            Vector2 targetDirection = (coordinatedTarget - enemyPos).normalized;
            RaycastHit2D hit = Physics2D.Raycast(
                enemyPos,
                targetDirection,
                5f,
                enemy.ObstacleLayer
            );

            if (hit.collider != null)
            {
                Vector2[] alternativeDirections = new Vector2[]
                {
                    Quaternion.Euler(0, 0, 45) * targetDirection,
                    Quaternion.Euler(0, 0, -45) * targetDirection,
                    Quaternion.Euler(0, 0, 90) * targetDirection,
                    Quaternion.Euler(0, 0, -90) * targetDirection
                };

                foreach (var altDir in alternativeDirections)
                {
                    RaycastHit2D altHit = Physics2D.Raycast(
                        enemyPos,
                        altDir,
                        5f,
                        enemy.ObstacleLayer
                    );

                    if (altHit.collider == null)
                    {
                        currentPathTarget = enemyPos + altDir * 3f;
                        return;
                    }
                }
            }

            currentPathTarget = coordinatedTarget;
        }
    }

    public class AttackState : EnemyState
    {
        private float attackTimer;
        private float attackCooldown = 1.5f;
        private bool hasAttacked;

        public AttackState(EnemyStateMachine stateMachine, EnemyAI enemy) 
            : base(stateMachine, enemy) { }

        public override void Enter()
        {
            attackTimer = 0f;
            hasAttacked = false;
        }

        public override void Update()
        {
            if (!enemy.IsPlayerInAttackRange() && !enemy.IsPlayerInDetectionRange())
            {
                stateMachine.ChangeState(EnemyStateType.Patrolling);
                return;
            }

            if (!enemy.IsPlayerInAttackRange() && enemy.IsPlayerInDetectionRange())
            {
                stateMachine.ChangeState(EnemyStateType.Chasing);
                return;
            }

            attackTimer += Time.deltaTime;

            if (!hasAttacked && attackTimer >= attackCooldown * 0.5f)
            {
                enemy.PerformAttack();
                hasAttacked = true;
            }

            if (attackTimer >= attackCooldown)
            {
                attackTimer = 0f;
                hasAttacked = false;
            }
        }

        public override void Exit() { }
    }

    public class HitState : EnemyState
    {
        private float hitDuration = 0.3f;
        private float hitTimer;

        public HitState(EnemyStateMachine stateMachine, EnemyAI enemy) 
            : base(stateMachine, enemy) { }

        public override void Enter()
        {
            hitTimer = 0f;
            enemy.PlayHitAnimation();
        }

        public override void Update()
        {
            hitTimer += Time.deltaTime;

            if (hitTimer >= hitDuration)
            {
                if (enemy.IsDead())
                {
                    stateMachine.ChangeState(EnemyStateType.Dead);
                }
                else if (enemy.IsPlayerInDetectionRange())
                {
                    stateMachine.ChangeState(EnemyStateType.Chasing);
                }
                else
                {
                    stateMachine.ChangeState(EnemyStateType.Patrolling);
                }
            }
        }

        public override void Exit() { }
    }

    public class DeadState : EnemyState
    {
        public DeadState(EnemyStateMachine stateMachine, EnemyAI enemy) 
            : base(stateMachine, enemy) { }

        public override void Enter()
        {
            enemy.PlayDeathAnimation();
            enemy.DisableCollider();
        }

        public override void Update() { }

        public override void Exit() { }
    }
}
