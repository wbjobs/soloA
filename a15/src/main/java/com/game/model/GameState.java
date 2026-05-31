package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Data
public class GameState implements Serializable {
    private String matchId;
    private volatile int currentTurn;
    private volatile int currentPhase;
    private volatile long currentPlayerId;
    private volatile String currentHeroId;
    private final Map<String, HeroInstance> heroes;
    private List<Long> turnOrder;
    private volatile int turnOrderIndex;
    private volatile boolean isGameOver;
    private volatile int winnerTeamId;
    private final StringBuilder matchLog;
    private volatile long phaseEndTime;
    private final int mapWidth;
    private final int mapHeight;
    private final List<ActionRecord> actionHistory;
    private final Map<Long, Integer> playerKills;
    private final Map<Long, Integer> playerDeaths;
    private final Map<Long, Long> playerDamageDealt;
    private final Map<Long, Long> playerHealing;
    
    public GameState() {
        this.matchId = UUID.randomUUID().toString().replace("-", "");
        this.currentTurn = 0;
        this.currentPhase = 0;
        this.heroes = new ConcurrentHashMap<>();
        this.turnOrder = new ArrayList<>();
        this.turnOrderIndex = 0;
        this.isGameOver = false;
        this.winnerTeamId = 0;
        this.matchLog = new StringBuilder();
        this.actionHistory = new CopyOnWriteArrayList<>();
        this.playerKills = new ConcurrentHashMap<>();
        this.playerDeaths = new ConcurrentHashMap<>();
        this.playerDamageDealt = new ConcurrentHashMap<>();
        this.playerHealing = new ConcurrentHashMap<>();
        this.mapWidth = 10;
        this.mapHeight = 8;
    }
    
    public void addHero(HeroInstance hero) {
        heroes.put(hero.getInstanceId(), hero);
        if (!playerKills.containsKey(hero.getPlayerId())) {
            playerKills.put(hero.getPlayerId(), 0);
            playerDeaths.put(hero.getPlayerId(), 0);
            playerDamageDealt.put(hero.getPlayerId(), 0L);
            playerHealing.put(hero.getPlayerId(), 0L);
        }
    }
    
    public void initializeTurnOrder() {
        turnOrder = heroes.values().stream()
                .sorted(Comparator.comparingInt(HeroInstance::getEffectiveSpeed).reversed())
                .map(HeroInstance::getPlayerId)
                .distinct()
                .collect(Collectors.toList());
        turnOrderIndex = 0;
    }
    
    public void startGame() {
        currentTurn = 1;
        initializeTurnOrder();
        nextPlayer();
        addLog("游戏开始！第 1 回合");
    }
    
    public boolean nextPlayer() {
        if (isGameOver) return false;
        
        if (turnOrderIndex >= turnOrder.size()) {
            turnOrderIndex = 0;
            currentTurn++;
            addLog("第 " + currentTurn + " 回合开始");
            
            for (HeroInstance hero : heroes.values()) {
                if (hero.isAlive()) {
                    hero.tickStatusEffectsStart();
                    hero.tickSkillCooldowns();
                    hero.resetTurn();
                }
            }
            
            checkGameOver();
            if (isGameOver) return false;
        }
        
        currentPlayerId = turnOrder.get(turnOrderIndex);
        turnOrderIndex++;
        
        HeroInstance currentHero = getCurrentHero();
        if (currentHero != null) {
            currentHeroId = currentHero.getInstanceId();
            
            if (!currentHero.isAlive()) {
                return nextPlayer();
            }
            
            if (currentHero.isStunned()) {
                addLog(currentHero.getName() + " 被眩晕，跳过回合");
                endPlayerTurn();
                return nextPlayer();
            }
            
            addLog(currentHero.getName() + " 的回合");
            phaseEndTime = System.currentTimeMillis() + 30000;
        }
        
        return true;
    }
    
    public HeroInstance getCurrentHero() {
        return heroes.values().stream()
                .filter(h -> h.getPlayerId() == currentPlayerId && h.isAlive())
                .findFirst()
                .orElse(null);
    }
    
    public HeroInstance getHeroByPlayerId(long playerId) {
        return heroes.values().stream()
                .filter(h -> h.getPlayerId() == playerId)
                .findFirst()
                .orElse(null);
    }
    
    public void endPlayerTurn() {
        HeroInstance hero = getHeroByPlayerId(currentPlayerId);
        if (hero != null) {
            hero.tickStatusEffectsEnd();
            checkGameOver();
        }
    }
    
    public boolean moveHero(String heroId, Position targetPos) {
        HeroInstance hero = heroes.get(heroId);
        if (hero == null || !hero.isAlive() || hero.hasMoved()) {
            return false;
        }
        
        int distance = hero.getPosition().manhattanDistance(targetPos);
        if (distance > hero.getMoveRange()) {
            return false;
        }
        
        if (isPositionOccupied(targetPos)) {
            return false;
        }
        
        if (targetPos.getX() < 0 || targetPos.getX() >= mapWidth ||
            targetPos.getY() < 0 || targetPos.getY() >= mapHeight) {
            return false;
        }
        
        hero.setPosition(targetPos);
        hero.setHasMoved(true);
        addLog(hero.getName() + " 移动到 (" + targetPos.getX() + ", " + targetPos.getY() + ")");
        
        addActionRecord(GameProtocol.ActionType.ACTION_MOVE, hero, null, 0, 0, null);
        return true;
    }
    
    public ActionResult basicAttack(String attackerId, String targetId) {
        HeroInstance attacker = heroes.get(attackerId);
        HeroInstance target = heroes.get(targetId);
        
        if (attacker == null || target == null || !attacker.isAlive() || !target.isAlive()) {
            return ActionResult.fail("目标无效");
        }
        
        if (attacker.hasActed()) {
            return ActionResult.fail("已经行动过了");
        }
        
        int distance = attacker.getPosition().manhattanDistance(target.getPosition());
        if (distance > attacker.getAttackRange()) {
            return ActionResult.fail("目标超出攻击范围");
        }
        
        int damage = calculateDamage(attacker, target, GameProtocol.DamageType.DAMAGE_PHYSICAL);
        int actualDamage = target.takeDamage(damage, GameProtocol.DamageType.DAMAGE_PHYSICAL, false);
        
        attacker.setHasActed(true);
        
        addLog(attacker.getName() + " 攻击 " + target.getName() + "，造成 " + actualDamage + " 点伤害");
        
        playerDamageDealt.merge(attacker.getPlayerId(), (long)actualDamage, Long::sum);
        
        ActionResult result = ActionResult.success(GameProtocol.ActionType.ACTION_ATTACK, 
                                                   attacker, target, actualDamage, 0, null);
        
        if (!target.isAlive()) {
            result.setTargetKilled(true);
            playerKills.merge(attacker.getPlayerId(), 1, Integer::sum);
            playerDeaths.merge(target.getPlayerId(), 1, Integer::sum);
            addLog(target.getName() + " 被击败！");
            checkGameOver();
        }
        
        addActionRecord(GameProtocol.ActionType.ACTION_ATTACK, attacker, target, actualDamage, 0, null);
        return result;
    }
    
    public ActionResult useSkill(String casterId, String skillId, String targetId, Position targetPos) {
        HeroInstance caster = heroes.get(casterId);
        if (caster == null || !caster.isAlive()) {
            return ActionResult.fail("施法者无效");
        }
        
        if (caster.hasActed()) {
            return ActionResult.fail("已经行动过了");
        }
        
        Skill skill = caster.getSkills().get(skillId);
        if (skill == null) {
            return ActionResult.fail("技能不存在");
        }
        
        if (!caster.canUseSkill(skillId)) {
            return ActionResult.fail("技能冷却中或法力不足");
        }
        
        caster.consumeMana(skill.getManaCost());
        caster.setSkillCooldown(skillId);
        caster.setHasActed(true);
        
        ActionResult result = new ActionResult();
        result.setSuccess(true);
        result.setActionType(GameProtocol.ActionType.ACTION_SKILL);
        result.setSourceHeroId(casterId);
        result.setSourcePlayerId(caster.getPlayerId());
        
        int totalDamage = 0;
        int totalHealing = 0;
        List<StatusEffect> appliedEffects = new ArrayList<>();
        
        switch (skill.getTargetType()) {
            case TARGET_SINGLE:
                if (targetId != null && heroes.containsKey(targetId)) {
                    HeroInstance target = heroes.get(targetId);
                    int dist = caster.getPosition().manhattanDistance(target.getPosition());
                    if (dist > skill.getRange()) {
                        return ActionResult.fail("目标超出技能范围");
                    }
                    
                    if (skill.getDamage() > 0) {
                        int dmg = calculateSkillDamage(caster, target, skill);
                        int actualDmg = target.takeDamage(dmg, skill.getDamageType(), false);
                        totalDamage += actualDmg;
                        result.setTargetHeroId(targetId);
                        result.setTargetPlayerId(target.getPlayerId());
                        
                        playerDamageDealt.merge(caster.getPlayerId(), (long)actualDmg, Long::sum);
                        
                        addLog(caster.getName() + " 使用 " + skill.getName() + " 攻击 " + 
                               target.getName() + "，造成 " + actualDmg + " 点伤害");
                        
                        if (!target.isAlive()) {
                            result.setTargetKilled(true);
                            playerKills.merge(caster.getPlayerId(), 1, Integer::sum);
                            playerDeaths.merge(target.getPlayerId(), 1, Integer::sum);
                            addLog(target.getName() + " 被击败！");
                        }
                    }
                    
                    if (skill.getHealing() > 0 && target.isAlive()) {
                        int heal = target.heal(skill.getHealing());
                        totalHealing += heal;
                        playerHealing.merge(caster.getPlayerId(), (long)heal, Long::sum);
                        addLog(caster.getName() + " 使用 " + skill.getName() + " 治疗 " + 
                               target.getName() + "，恢复 " + heal + " 点生命");
                    }
                    
                    for (StatusEffectTemplate template : skill.getStatusEffects()) {
                        if (template.shouldApply()) {
                            StatusEffect effect = template.createInstance(casterId, caster.getPlayerId());
                            target.addStatusEffect(effect);
                            appliedEffects.add(effect);
                            addLog(target.getName() + " 获得效果: " + effect.getName());
                        }
                    }
                }
                break;
                
            case TARGET_SELF:
                if (skill.getHealing() > 0) {
                    int heal = caster.heal(skill.getHealing());
                    totalHealing += heal;
                    playerHealing.merge(caster.getPlayerId(), (long)heal, Long::sum);
                    addLog(caster.getName() + " 使用 " + skill.getName() + "，恢复 " + heal + " 点生命");
                }
                
                for (StatusEffectTemplate template : skill.getStatusEffects()) {
                    if (template.shouldApply()) {
                        StatusEffect effect = template.createInstance(casterId, caster.getPlayerId());
                        caster.addStatusEffect(effect);
                        appliedEffects.add(effect);
                        addLog(caster.getName() + " 获得效果: " + effect.getName());
                    }
                }
                break;
                
            case TARGET_TEAM:
                for (HeroInstance target : heroes.values()) {
                    if (!target.isAlive()) continue;
                    
                    if (skill.getHealing() > 0 && target.getTeamId() == caster.getTeamId()) {
                        int heal = target.heal(skill.getHealing());
                        totalHealing += heal;
                        playerHealing.merge(caster.getPlayerId(), (long)heal, Long::sum);
                    }
                    
                    if (skill.getDamage() > 0 && target.getTeamId() != caster.getTeamId()) {
                        int dmg = calculateSkillDamage(caster, target, skill);
                        int actualDmg = target.takeDamage(dmg, skill.getDamageType(), false);
                        totalDamage += actualDmg;
                        playerDamageDealt.merge(caster.getPlayerId(), (long)actualDmg, Long::sum);
                        
                        if (!target.isAlive()) {
                            playerKills.merge(caster.getPlayerId(), 1, Integer::sum);
                            playerDeaths.merge(target.getPlayerId(), 1, Integer::sum);
                        }
                    }
                    
                    for (StatusEffectTemplate template : skill.getStatusEffects()) {
                        if (template.shouldApply()) {
                            boolean isFriendly = target.getTeamId() == caster.getTeamId();
                            boolean applyToFriendly = template.getEffectType() == GameProtocol.EffectType.EFFECT_BUFF;
                            if ((isFriendly && applyToFriendly) || (!isFriendly && !applyToFriendly)) {
                                StatusEffect effect = template.createInstance(casterId, caster.getPlayerId());
                                target.addStatusEffect(effect);
                                appliedEffects.add(effect);
                            }
                        }
                    }
                }
                addLog(caster.getName() + " 使用 " + skill.getName());
                break;
                
            case TARGET_AREA:
                if (targetPos != null) {
                    for (HeroInstance target : heroes.values()) {
                        if (!target.isAlive()) continue;
                        int dist = target.getPosition().manhattanDistance(targetPos);
                        if (dist <= skill.getAoeRadius()) {
                            if (skill.getDamage() > 0) {
                                int dmg = calculateSkillDamage(caster, target, skill);
                                int actualDmg = target.takeDamage(dmg, skill.getDamageType(), false);
                                totalDamage += actualDmg;
                                playerDamageDealt.merge(caster.getPlayerId(), (long)actualDmg, Long::sum);
                                
                                if (!target.isAlive()) {
                                    playerKills.merge(caster.getPlayerId(), 1, Integer::sum);
                                    playerDeaths.merge(target.getPlayerId(), 1, Integer::sum);
                                }
                            }
                            
                            if (skill.getHealing() > 0 && target.getTeamId() == caster.getTeamId()) {
                                int heal = target.heal(skill.getHealing());
                                totalHealing += heal;
                                playerHealing.merge(caster.getPlayerId(), (long)heal, Long::sum);
                            }
                            
                            for (StatusEffectTemplate template : skill.getStatusEffects()) {
                                if (template.shouldApply()) {
                                    StatusEffect effect = template.createInstance(casterId, caster.getPlayerId());
                                    target.addStatusEffect(effect);
                                    appliedEffects.add(effect);
                                }
                            }
                        }
                    }
                    addLog(caster.getName() + " 使用 " + skill.getName() + " 攻击区域 (" + 
                           targetPos.getX() + ", " + targetPos.getY() + ")");
                }
                break;
        }
        
        result.setDamageDealt(totalDamage);
        result.setHealingDone(totalHealing);
        result.setAppliedEffects(appliedEffects);
        
        checkGameOver();
        addActionRecord(GameProtocol.ActionType.ACTION_SKILL, caster, null, totalDamage, totalHealing, appliedEffects);
        
        return result;
    }
    
    private int calculateDamage(HeroInstance attacker, HeroInstance target, GameProtocol.DamageType type) {
        int baseDamage = attacker.getEffectiveAttack();
        
        switch (type) {
            case DAMAGE_PHYSICAL:
                baseDamage = attacker.getEffectiveAttack();
                break;
            case DAMAGE_MAGICAL:
                baseDamage = (int)(attacker.getEffectiveAttack() * 0.8);
                break;
            case DAMAGE_TRUE:
                baseDamage = attacker.getEffectiveAttack();
                break;
        }
        
        double randomFactor = 0.9 + Math.random() * 0.2;
        return (int)(baseDamage * randomFactor);
    }
    
    private int calculateSkillDamage(HeroInstance caster, HeroInstance target, Skill skill) {
        GameProtocol.DamageType damageType = skill.getDamageType();
        int attackBonus = 0;
        
        switch (damageType) {
            case DAMAGE_PHYSICAL:
                attackBonus = (int)(caster.getEffectiveAttack() * 0.6);
                break;
            case DAMAGE_MAGICAL:
                attackBonus = (int)(caster.getEffectiveAttack() * 0.8);
                break;
            case DAMAGE_TRUE:
                attackBonus = (int)(caster.getEffectiveAttack() * 0.3);
                break;
        }
        
        int baseDamage = skill.getDamage() + attackBonus;
        
        if (baseDamage <= 0) {
            return 0;
        }
        
        double randomFactor = 0.9 + Math.random() * 0.2;
        return Math.max(1, (int)(baseDamage * randomFactor));
    }
    
    private boolean isPositionOccupied(Position pos) {
        return heroes.values().stream()
                .anyMatch(h -> h.isAlive() && h.getPosition().getX() == pos.getX() 
                           && h.getPosition().getY() == pos.getY());
    }
    
    private void checkGameOver() {
        List<HeroInstance> team1Alive = heroes.values().stream()
                .filter(h -> h.isAlive() && h.getTeamId() == 1)
                .collect(Collectors.toList());
        List<HeroInstance> team2Alive = heroes.values().stream()
                .filter(h -> h.isAlive() && h.getTeamId() == 2)
                .collect(Collectors.toList());
        
        if (team1Alive.isEmpty()) {
            isGameOver = true;
            winnerTeamId = 2;
            addLog("游戏结束！队伍 2 获胜！");
        } else if (team2Alive.isEmpty()) {
            isGameOver = true;
            winnerTeamId = 1;
            addLog("游戏结束！队伍 1 获胜！");
        }
    }
    
    private void addLog(String message) {
        if (matchLog.length() > 0) {
            matchLog.append("\n");
        }
        matchLog.append(message);
    }
    
    private void addActionRecord(GameProtocol.ActionType actionType, HeroInstance source, 
                                 HeroInstance target, int damage, int healing, 
                                 List<StatusEffect> effects) {
        ActionRecord record = new ActionRecord();
        record.setTurnNumber(currentTurn);
        record.setActionType(actionType);
        record.setTimestamp(System.currentTimeMillis());
        record.setSourcePlayerId(source.getPlayerId());
        record.setSourceHeroId(source.getInstanceId());
        if (target != null) {
            record.setTargetPlayerId(target.getPlayerId());
            record.setTargetHeroId(target.getInstanceId());
        }
        record.setDamageDealt(damage);
        record.setHealingDone(healing);
        record.setAppliedEffects(effects);
        actionHistory.add(record);
    }
    
    public GameProtocol.GameState toProto() {
        GameProtocol.GameState.Builder builder = GameProtocol.GameState.newBuilder()
                .setMatchId(matchId)
                .setCurrentTurn(currentTurn)
                .setCurrentPhase(currentPhase)
                .setCurrentPlayerId(currentPlayerId)
                .setCurrentHeroId(currentHeroId != null ? currentHeroId : "")
                .setIsGameOver(isGameOver)
                .setWinnerTeamId(winnerTeamId)
                .setMatchLog(matchLog.toString())
                .setPhaseEndTime(phaseEndTime);
        
        for (HeroInstance hero : heroes.values()) {
            builder.addHeroes(hero.toProto());
        }
        
        for (Long playerId : turnOrder) {
            builder.addTurnOrder(playerId);
        }
        
        return builder.build();
    }
}
