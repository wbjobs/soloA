package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
public class Skill implements Serializable {
    private String skillId;
    private String name;
    private String description;
    private GameProtocol.TargetType targetType;
    private GameProtocol.DamageType damageType;
    private int damage;
    private int healing;
    private int cooldown;
    private int range;
    private int aoeRadius;
    private int priority;
    private int manaCost;
    private List<StatusEffectTemplate> statusEffects;
    
    public Skill() {
        this.statusEffects = new ArrayList<>();
    }
    
    public GameProtocol.SkillData toProto(int currentCooldown) {
        return GameProtocol.SkillData.newBuilder()
                .setSkillId(skillId)
                .setName(name)
                .setDescription(description)
                .setTargetType(targetType)
                .setDamageType(damageType)
                .setDamage(damage)
                .setHealing(healing)
                .setCooldown(cooldown)
                .setCurrentCooldown(currentCooldown)
                .setRange(range)
                .setAoeRadius(aoeRadius)
                .setPriority(priority)
                .setManaCost(manaCost)
                .build();
    }
}
