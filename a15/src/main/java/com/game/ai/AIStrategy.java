package com.game.ai;

import com.game.model.*;
import com.game.protocol.GameProtocol;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class AIStrategy {
    
    private static final int MAX_SEARCH_DEPTH = 2;
    private static final double ATTACK_WEIGHT = 1.0;
    private static final double HEALTH_WEIGHT = 0.8;
    private static final double SKILL_WEIGHT = 1.2;
    private static final double POSITION_WEIGHT = 0.6;
    
    public AIAction decideAction(HeroInstance aiHero, GameState gameState, GameProtocol.AIDifficulty difficulty) {
        List<AIAction> possibleActions = generateAllPossibleActions(aiHero, gameState);
        
        if (possibleActions.isEmpty()) {
            return AIAction.endTurn(aiHero.getInstanceId());
        }
        
        AIAction bestAction;
        
        switch (difficulty) {
            case AI_EASY:
                bestAction = selectRandomAction(possibleActions);
                break;
            case AI_NORMAL:
                bestAction = selectGreedyAction(aiHero, gameState, possibleActions);
                break;
            case AI_HARD:
                bestAction = selectMinimaxAction(aiHero, gameState, possibleActions);
                break;
            default:
                bestAction = selectGreedyAction(aiHero, gameState, possibleActions);
        }
        
        log.debug("AI decided action: type={}, target={}", bestAction.getType(), bestAction.getTargetId());
        return bestAction;
    }
    
    private List<AIAction> generateAllPossibleActions(HeroInstance aiHero, GameState gameState) {
        List<AIAction> actions = new ArrayList<>();
        
        if (!aiHero.isAlive() || aiHero.isStunned()) {
            actions.add(AIAction.endTurn(aiHero.getInstanceId()));
            return actions;
        }
        
        List<HeroInstance> enemies = getEnemies(aiHero, gameState);
        List<HeroInstance> allies = getAllies(aiHero, gameState);
        
        if (!aiHero.hasActed()) {
            for (String skillId : aiHero.getSkills().keySet()) {
                if (!aiHero.canUseSkill(skillId)) continue;
                
                Skill skill = aiHero.getSkills().get(skillId);
                
                switch (skill.getTargetType()) {
                    case TARGET_SINGLE:
                        if (skill.getDamage() > 0) {
                            for (HeroInstance enemy : enemies) {
                                if (enemy.isAlive() && isInRange(aiHero, enemy, skill.getRange())) {
                                    actions.add(AIAction.skill(aiHero.getInstanceId(), skillId, enemy.getInstanceId(), enemy.getPlayerId()));
                                }
                            }
                        }
                        if (skill.getHealing() > 0) {
                            for (HeroInstance ally : allies) {
                                if (ally.isAlive() && isInRange(aiHero, ally, skill.getRange())) {
                                    actions.add(AIAction.skill(aiHero.getInstanceId(), skillId, ally.getInstanceId(), ally.getPlayerId()));
                                }
                            }
                        }
                        break;
                        
                    case TARGET_SELF:
                        actions.add(AIAction.skill(aiHero.getInstanceId(), skillId, aiHero.getInstanceId(), aiHero.getPlayerId()));
                        break;
                        
                    case TARGET_TEAM:
                        actions.add(AIAction.skill(aiHero.getInstanceId(), skillId, null, 0));
                        break;
                        
                    case TARGET_AREA:
                        for (Position pos : getAreaPositions(aiHero, gameState, skill.getRange())) {
                            actions.add(AIAction.skillArea(aiHero.getInstanceId(), skillId, pos));
                        }
                        break;
                }
            }
            
            for (HeroInstance enemy : enemies) {
                if (enemy.isAlive() && isInRange(aiHero, enemy, aiHero.getAttackRange())) {
                    actions.add(AIAction.attack(aiHero.getInstanceId(), enemy.getInstanceId(), enemy.getPlayerId()));
                }
            }
        }
        
        if (!aiHero.hasMoved()) {
            List<Position> reachablePositions = getReachablePositions(aiHero, gameState);
            for (Position pos : reachablePositions) {
                actions.add(AIAction.move(aiHero.getInstanceId(), pos));
            }
        }
        
        if (actions.isEmpty()) {
            actions.add(AIAction.endTurn(aiHero.getInstanceId()));
        }
        
        return actions;
    }
    
    private AIAction selectRandomAction(List<AIAction> actions) {
        Random random = new Random();
        List<AIAction> nonEndActions = actions.stream()
                .filter(a -> a.getType() != GameProtocol.ActionType.ACTION_END_TURN)
                .collect(Collectors.toList());
        
        if (!nonEndActions.isEmpty() && random.nextDouble() < 0.7) {
            return nonEndActions.get(random.nextInt(nonEndActions.size()));
        }
        
        return actions.get(random.nextInt(actions.size()));
    }
    
    private AIAction selectGreedyAction(HeroInstance aiHero, GameState gameState, List<AIAction> actions) {
        AIAction bestAction = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        
        for (AIAction action : actions) {
            double score = evaluateAction(aiHero, gameState, action);
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        }
        
        return bestAction != null ? bestAction : AIAction.endTurn(aiHero.getInstanceId());
    }
    
    private AIAction selectMinimaxAction(HeroInstance aiHero, GameState gameState, List<AIAction> actions) {
        AIAction bestAction = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        
        for (AIAction action : actions) {
            GameState simulatedState = simulateAction(gameState, aiHero, action);
            double score = minimax(simulatedState, MAX_SEARCH_DEPTH - 1, Double.NEGATIVE_INFINITY, 
                                   Double.POSITIVE_INFINITY, false, aiHero.getTeamId());
            
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        }
        
        return bestAction != null ? bestAction : AIAction.endTurn(aiHero.getInstanceId());
    }
    
    private double evaluateAction(HeroInstance aiHero, GameState gameState, AIAction action) {
        double score = 0;
        
        switch (action.getType()) {
            case ACTION_ATTACK:
                HeroInstance attackTarget = gameState.getHeroes().get(action.getTargetId());
                if (attackTarget != null) {
                    int estimatedDamage = estimateDamage(aiHero, attackTarget, false);
                    score = estimatedDamage * ATTACK_WEIGHT;
                    
                    if (estimatedDamage >= attackTarget.getCurrentHealth()) {
                        score += 50;
                    }
                    
                    if (attackTarget.getCurrentHealth() < attackTarget.getMaxHealth() * 0.3) {
                        score += 20;
                    }
                }
                break;
                
            case ACTION_SKILL:
                Skill skill = aiHero.getSkills().get(action.getSkillId());
                if (skill != null) {
                    if (skill.getDamage() > 0) {
                        HeroInstance skillTarget = gameState.getHeroes().get(action.getTargetId());
                        if (skillTarget != null) {
                            int estimatedDamage = estimateSkillDamage(aiHero, skillTarget, skill);
                            score = estimatedDamage * SKILL_WEIGHT;
                            
                            if (estimatedDamage >= skillTarget.getCurrentHealth()) {
                                score += 60;
                            }
                            
                            if (!skill.getStatusEffects().isEmpty()) {
                                score += 15;
                            }
                        }
                    }
                    
                    if (skill.getHealing() > 0) {
                        score += skill.getHealing() * HEALTH_WEIGHT;
                        
                        if (action.getTargetId() != null && 
                            action.getTargetId().equals(aiHero.getInstanceId())) {
                            double healthRatio = (double) aiHero.getCurrentHealth() / aiHero.getMaxHealth();
                            if (healthRatio < 0.5) {
                                score += 30;
                            }
                        }
                    }
                }
                break;
                
            case ACTION_MOVE:
                score = evaluateMovePosition(aiHero, gameState, action.getTargetPosition());
                break;
                
            case ACTION_END_TURN:
                score = -10;
                break;
        }
        
        return score + (Math.random() * 5);
    }
    
    private double evaluateMovePosition(HeroInstance aiHero, GameState gameState, Position targetPos) {
        double score = 0;
        
        int minEnemyDistance = Integer.MAX_VALUE;
        List<HeroInstance> enemies = getEnemies(aiHero, gameState);
        for (HeroInstance enemy : enemies) {
            if (enemy.isAlive()) {
                int dist = targetPos.manhattanDistance(enemy.getPosition());
                minEnemyDistance = Math.min(minEnemyDistance, dist);
                
                if (dist <= aiHero.getAttackRange()) {
                    score += 25;
                }
            }
        }
        
        if (aiHero.getCurrentHealth() < aiHero.getMaxHealth() * 0.3) {
            score += minEnemyDistance * 2;
        }
        
        double centerX = gameState.getMapWidth() / 2.0;
        double centerY = gameState.getMapHeight() / 2.0;
        double distToCenter = Math.sqrt(Math.pow(targetPos.getX() - centerX, 2) + 
                                        Math.pow(targetPos.getY() - centerY, 2));
        score -= distToCenter * POSITION_WEIGHT;
        
        return score;
    }
    
    private double minimax(GameState state, int depth, double alpha, double beta, boolean maximizingPlayer, int teamId) {
        if (depth == 0 || state.isGameOver()) {
            return evaluateState(state, teamId);
        }
        
        if (maximizingPlayer) {
            double maxEval = Double.NEGATIVE_INFINITY;
            for (HeroInstance hero : getTeamHeroes(state, teamId)) {
                if (!hero.isAlive()) continue;
                List<AIAction> actions = generateAllPossibleActions(hero, state);
                for (AIAction action : actions) {
                    GameState newState = simulateAction(state, hero, action);
                    double eval = minimax(newState, depth - 1, alpha, beta, false, teamId);
                    maxEval = Math.max(maxEval, eval);
                    alpha = Math.max(alpha, eval);
                    if (beta <= alpha) break;
                }
            }
            return maxEval;
        } else {
            double minEval = Double.POSITIVE_INFINITY;
            int enemyTeamId = teamId == 1 ? 2 : 1;
            for (HeroInstance hero : getTeamHeroes(state, enemyTeamId)) {
                if (!hero.isAlive()) continue;
                List<AIAction> actions = generateAllPossibleActions(hero, state);
                for (AIAction action : actions) {
                    GameState newState = simulateAction(state, hero, action);
                    double eval = minimax(newState, depth - 1, alpha, beta, true, teamId);
                    minEval = Math.min(minEval, eval);
                    beta = Math.min(beta, eval);
                    if (beta <= alpha) break;
                }
            }
            return minEval;
        }
    }
    
    private double evaluateState(GameState state, int teamId) {
        if (state.isGameOver()) {
            return state.getWinnerTeamId() == teamId ? 1000 : -1000;
        }
        
        double score = 0;
        
        for (HeroInstance hero : getTeamHeroes(state, teamId)) {
            if (hero.isAlive()) {
                score += hero.getCurrentHealth();
                score += hero.getEffectiveAttack() * 0.5;
                score += hero.getEffectiveDefense() * 0.3;
            }
        }
        
        int enemyTeamId = teamId == 1 ? 2 : 1;
        for (HeroInstance hero : getTeamHeroes(state, enemyTeamId)) {
            if (hero.isAlive()) {
                score -= hero.getCurrentHealth() * 1.2;
            }
        }
        
        return score;
    }
    
    private List<HeroInstance> getEnemies(HeroInstance hero, GameState gameState) {
        List<HeroInstance> enemies = new ArrayList<>();
        for (HeroInstance h : gameState.getHeroes().values()) {
            if (h.getTeamId() != hero.getTeamId()) {
                enemies.add(h);
            }
        }
        return enemies;
    }
    
    private List<HeroInstance> getAllies(HeroInstance hero, GameState gameState) {
        List<HeroInstance> allies = new ArrayList<>();
        for (HeroInstance h : gameState.getHeroes().values()) {
            if (h.getTeamId() == hero.getTeamId()) {
                allies.add(h);
            }
        }
        return allies;
    }
    
    private List<HeroInstance> getTeamHeroes(GameState state, int teamId) {
        List<HeroInstance> heroes = new ArrayList<>();
        for (HeroInstance h : state.getHeroes().values()) {
            if (h.getTeamId() == teamId) {
                heroes.add(h);
            }
        }
        return heroes;
    }
    
    private boolean isInRange(HeroInstance from, HeroInstance to, int range) {
        return from.getPosition().manhattanDistance(to.getPosition()) <= range;
    }
    
    private List<Position> getReachablePositions(HeroInstance hero, GameState gameState) {
        List<Position> positions = new ArrayList<>();
        Position start = hero.getPosition();
        int moveRange = hero.getMoveRange();
        
        for (int dx = -moveRange; dx <= moveRange; dx++) {
            for (int dy = -moveRange; dy <= moveRange; dy++) {
                Position pos = new Position(start.getX() + dx, start.getY() + dy);
                if (Math.abs(dx) + Math.abs(dy) <= moveRange && 
                    isPositionValid(pos, gameState) &&
                    !isPositionOccupied(pos, gameState, hero.getInstanceId())) {
                    positions.add(pos);
                }
            }
        }
        
        return positions;
    }
    
    private List<Position> getAreaPositions(HeroInstance hero, GameState gameState, int range) {
        List<Position> positions = new ArrayList<>();
        Position start = hero.getPosition();
        
        for (int dx = -range; dx <= range; dx++) {
            for (int dy = -range; dy <= range; dy++) {
                Position pos = new Position(start.getX() + dx, start.getY() + dy);
                if (Math.abs(dx) + Math.abs(dy) <= range && isPositionValid(pos, gameState)) {
                    positions.add(pos);
                }
            }
        }
        
        return positions;
    }
    
    private boolean isPositionValid(Position pos, GameState gameState) {
        return pos.getX() >= 0 && pos.getX() < gameState.getMapWidth() &&
               pos.getY() >= 0 && pos.getY() < gameState.getMapHeight();
    }
    
    private boolean isPositionOccupied(Position pos, GameState gameState, String excludeHeroId) {
        for (HeroInstance hero : gameState.getHeroes().values()) {
            if (!hero.getInstanceId().equals(excludeHeroId) && 
                hero.isAlive() && 
                hero.getPosition().getX() == pos.getX() && 
                hero.getPosition().getY() == pos.getY()) {
                return true;
            }
        }
        return false;
    }
    
    private int estimateDamage(HeroInstance attacker, HeroInstance target, boolean isSkill) {
        int attack = attacker.getEffectiveAttack();
        int defense = target.getEffectiveDefense();
        double defenseReduction = 100.0 / (100.0 + defense);
        return (int)(attack * defenseReduction);
    }
    
    private int estimateSkillDamage(HeroInstance caster, HeroInstance target, Skill skill) {
        int attackBonus = 0;
        switch (skill.getDamageType()) {
            case DAMAGE_PHYSICAL:
                attackBonus = (int)(caster.getEffectiveAttack() * 0.6);
                break;
            case DAMAGE_MAGICAL:
                attackBonus = (int)(caster.getEffectiveAttack() * 0.8);
                break;
            case DAMAGE_TRUE:
                return skill.getDamage();
        }
        
        int baseDamage = skill.getDamage() + attackBonus;
        if (skill.getDamageType() == GameProtocol.DamageType.DAMAGE_TRUE) {
            return baseDamage;
        }
        
        int defense = target.getEffectiveDefense();
        double defenseReduction = 100.0 / (100.0 + defense);
        return (int)(baseDamage * defenseReduction);
    }
    
    private GameState simulateAction(GameState state, HeroInstance hero, AIAction action) {
        GameState simulated = cloneState(state);
        HeroInstance simulatedHero = simulated.getHeroes().get(hero.getInstanceId());
        
        if (simulatedHero == null) return simulated;
        
        switch (action.getType()) {
            case ACTION_MOVE:
                simulated.moveHero(simulatedHero.getInstanceId(), action.getTargetPosition());
                break;
            case ACTION_ATTACK:
                simulated.basicAttack(simulatedHero.getInstanceId(), action.getTargetId());
                break;
            case ACTION_SKILL:
                simulated.useSkill(simulatedHero.getInstanceId(), action.getSkillId(), 
                                   action.getTargetId(), action.getTargetPosition());
                break;
        }
        
        return simulated;
    }
    
    private GameState cloneState(GameState state) {
        GameState clone = new GameState();
        clone.setMatchId(state.getMatchId());
        clone.setCurrentTurn(state.getCurrentTurn());
        clone.setCurrentPhase(state.getCurrentPhase());
        clone.setCurrentPlayerId(state.getCurrentPlayerId());
        clone.setCurrentHeroId(state.getCurrentHeroId());
        clone.setGameOver(state.isGameOver());
        clone.setWinnerTeamId(state.getWinnerTeamId());
        
        for (Map.Entry<String, HeroInstance> entry : state.getHeroes().entrySet()) {
            HeroInstance hero = entry.getValue();
            HeroInstance heroClone = cloneHero(hero);
            clone.getHeroes().put(heroClone.getInstanceId(), heroClone);
        }
        
        clone.setTurnOrder(new ArrayList<>(state.getTurnOrder()));
        clone.setTurnOrderIndex(state.getTurnOrderIndex());
        
        return clone;
    }
    
    private HeroInstance cloneHero(HeroInstance hero) {
        HeroInstance clone = new HeroInstance();
        clone.setHeroId(hero.getHeroId());
        clone.setInstanceId(hero.getInstanceId());
        clone.setName(hero.getName());
        clone.setPlayerId(hero.getPlayerId());
        clone.setTeamId(hero.getTeamId());
        clone.setMaxHealth(hero.getMaxHealth());
        clone.setCurrentHealth(hero.getCurrentHealth());
        clone.setMaxMana(hero.getMaxMana());
        clone.setCurrentMana(hero.getCurrentMana());
        clone.setBaseAttack(hero.getBaseAttack());
        clone.setBaseDefense(hero.getBaseDefense());
        clone.setBaseSpeed(hero.getBaseSpeed());
        clone.setMoveRange(hero.getMoveRange());
        clone.setAttackRange(hero.getAttackRange());
        clone.setPosition(new Position(hero.getPosition().getX(), hero.getPosition().getY()));
        clone.setHasMoved(hero.isHasMoved());
        clone.setHasActed(hero.isHasActed());
        clone.setAlive(hero.isAlive());
        clone.setSkills(new HashMap<>(hero.getSkills()));
        clone.setSkillCooldowns(new HashMap<>(hero.getSkillCooldowns()));
        clone.setStatusEffects(new ArrayList<>(hero.getStatusEffects()));
        return clone;
    }
}
