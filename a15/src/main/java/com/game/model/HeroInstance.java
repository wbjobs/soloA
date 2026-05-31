package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
public class HeroInstance implements Serializable {
    private String heroId;
    private String instanceId;
    private String name;
    private long playerId;
    private int teamId;
    
    private int maxHealth;
    private int currentHealth;
    private int maxMana;
    private int currentMana;
    private int baseAttack;
    private int baseDefense;
    private int baseSpeed;
    private int moveRange;
    private int attackRange;
    
    private Position position;
    private boolean hasMoved;
    private boolean hasActed;
    private boolean isAlive;
    
    private Map<String, Integer> skillCooldowns;
    private List<StatusEffect> statusEffects;
    private Map<String, Skill> skills;
    private Skill passiveSkill;
    
    public HeroInstance() {
        this.position = new Position(0, 0);
        this.skillCooldowns = new HashMap<>();
        this.statusEffects = new ArrayList<>();
        this.skills = new HashMap<>();
        this.isAlive = true;
        this.hasMoved = false;
        this.hasActed = false;
    }
    
    public int getEffectiveAttack() {
        int attack = baseAttack;
        for (StatusEffect effect : statusEffects) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_ATK_UP) {
                attack += effect.getValue() * effect.getStacks();
            } else if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_ATK_DOWN) {
                attack -= effect.getValue() * effect.getStacks();
            }
        }
        return Math.max(0, attack);
    }
    
    public int getEffectiveDefense() {
        int defense = baseDefense;
        for (StatusEffect effect : statusEffects) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_DEF_UP) {
                defense += effect.getValue() * effect.getStacks();
            } else if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_DEF_DOWN) {
                defense -= effect.getValue() * effect.getStacks();
            }
        }
        return Math.max(0, defense);
    }
    
    public int getEffectiveSpeed() {
        int speed = baseSpeed;
        for (StatusEffect effect : statusEffects) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_SLOW) {
                speed = (int)(speed * 0.7);
            }
        }
        return Math.max(1, speed);
    }
    
    public boolean isStunned() {
        for (StatusEffect effect : statusEffects) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_STUN) {
                return true;
            }
        }
        return false;
    }
    
    public int getShieldValue() {
        int shield = 0;
        for (StatusEffect effect : statusEffects) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_SHIELD) {
                shield += effect.getValue() * effect.getStacks();
            }
        }
        return shield;
    }
    
    public int takeDamage(int damage, GameProtocol.DamageType damageType, boolean ignoreShield) {
        if (!isAlive) return 0;
        
        int actualDamage = damage;
        if (!ignoreShield) {
            int shield = getShieldValue();
            if (shield > 0) {
                int shieldDamage = Math.min(shield, actualDamage);
                actualDamage -= shieldDamage;
                consumeShield(shieldDamage);
            }
        }
        
        if (actualDamage > 0 && damageType != GameProtocol.DamageType.DAMAGE_TRUE) {
            int defense = getEffectiveDefense();
            actualDamage = (int)(actualDamage * (100.0 / (100.0 + defense)));
        }
        
        currentHealth = Math.max(0, currentHealth - actualDamage);
        if (currentHealth <= 0) {
            isAlive = false;
        }
        
        return actualDamage;
    }
    
    public int heal(int amount) {
        if (!isAlive) return 0;
        int actualHeal = Math.min(amount, maxHealth - currentHealth);
        currentHealth += actualHeal;
        return actualHeal;
    }
    
    private void consumeShield(int amount) {
        int remaining = amount;
        for (StatusEffect effect : new ArrayList<>(statusEffects)) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_SHIELD && remaining > 0) {
                int stackValue = effect.getValue() * effect.getStacks();
                if (stackValue <= remaining) {
                    statusEffects.remove(effect);
                    remaining -= stackValue;
                } else {
                    int stacksToConsume = (int)Math.ceil((double)remaining / effect.getValue());
                    effect.setStacks(effect.getStacks() - stacksToConsume);
                    if (effect.getStacks() <= 0) {
                        statusEffects.remove(effect);
                    }
                    remaining = 0;
                }
            }
        }
    }
    
    public void addStatusEffect(StatusEffect effect) {
        if (!effect.isCanStack()) {
            statusEffects.removeIf(e -> e.getEffectId().equals(effect.getEffectId()));
        } else {
            for (StatusEffect existing : statusEffects) {
                if (existing.getEffectId().equals(effect.getEffectId())) {
                    existing.addStack();
                    return;
                }
            }
        }
        statusEffects.add(effect);
    }
    
    public void tickStatusEffectsStart() {
        for (StatusEffect effect : new ArrayList<>(statusEffects)) {
            if (effect.getCategory() == GameProtocol.EffectCategory.EFFECT_POISON ||
                effect.getCategory() == GameProtocol.EffectCategory.EFFECT_BURN) {
                takeDamage(effect.getValue() * effect.getStacks(), 
                           GameProtocol.DamageType.DAMAGE_TRUE, true);
            }
        }
    }
    
    public void tickStatusEffectsEnd() {
        for (StatusEffect effect : new ArrayList<>(statusEffects)) {
            effect.tick();
            if (effect.isExpired()) {
                statusEffects.remove(effect);
            }
        }
    }
    
    public void tickSkillCooldowns() {
        for (Map.Entry<String, Integer> entry : skillCooldowns.entrySet()) {
            if (entry.getValue() > 0) {
                skillCooldowns.put(entry.getKey(), entry.getValue() - 1);
            }
        }
    }
    
    public void resetTurn() {
        hasMoved = false;
        hasActed = false;
    }
    
    public void consumeMana(int amount) {
        currentMana = Math.max(0, currentMana - amount);
    }
    
    public boolean canUseSkill(String skillId) {
        if (!skills.containsKey(skillId)) return false;
        Skill skill = skills.get(skillId);
        Integer cooldown = skillCooldowns.getOrDefault(skillId, 0);
        return cooldown == 0 && currentMana >= skill.getManaCost();
    }
    
    public void setSkillCooldown(String skillId) {
        if (skills.containsKey(skillId)) {
            skillCooldowns.put(skillId, skills.get(skillId).getCooldown());
        }
    }
    
    public GameProtocol.HeroState toProto() {
        GameProtocol.HeroState.Builder builder = GameProtocol.HeroState.newBuilder()
                .setHeroId(heroId)
                .setCurrentHealth(currentHealth)
                .setMaxHealth(maxHealth)
                .setCurrentMana(currentMana)
                .setMaxMana(maxMana)
                .setAttack(getEffectiveAttack())
                .setDefense(getEffectiveDefense())
                .setSpeed(getEffectiveSpeed())
                .setPosition(position.toProto())
                .setHasMoved(hasMoved)
                .setHasActed(hasActed)
                .setIsAlive(isAlive)
                .setPlayerId(playerId)
                .setTeamId(teamId);
        
        for (StatusEffect effect : statusEffects) {
            builder.addStatusEffects(effect.toProto());
        }
        
        for (Map.Entry<String, Integer> entry : skillCooldowns.entrySet()) {
            builder.putSkillCooldowns(entry.getKey(), entry.getValue());
        }
        
        return builder.build();
    }
}
