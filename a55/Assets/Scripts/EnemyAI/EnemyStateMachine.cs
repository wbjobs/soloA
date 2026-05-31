using System.Collections.Generic;
using UnityEngine;

namespace EnemyAISystem
{
    public class EnemyStateMachine
    {
        private Dictionary<EnemyStateType, EnemyState> states;
        private EnemyState currentState;
        public EnemyStateType CurrentStateType { get; private set; }

        public EnemyStateMachine(EnemyAI enemy)
        {
            states = new Dictionary<EnemyStateType, EnemyState>
            {
                { EnemyStateType.Patrolling, new PatrolState(this, enemy) },
                { EnemyStateType.Chasing, new ChaseState(this, enemy) },
                { EnemyStateType.Attacking, new AttackState(this, enemy) },
                { EnemyStateType.Hit, new HitState(this, enemy) },
                { EnemyStateType.Dead, new DeadState(this, enemy) }
            };
        }

        public void Initialize(EnemyStateType startingState)
        {
            ChangeState(startingState);
        }

        public void ChangeState(EnemyStateType newState)
        {
            if (currentState != null)
            {
                currentState.Exit();
            }

            CurrentStateType = newState;
            currentState = states[newState];
            currentState.Enter();
        }

        public void Update()
        {
            currentState?.Update();
        }
    }
}
