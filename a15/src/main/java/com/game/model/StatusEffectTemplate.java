package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;

@Data
public class StatusEffectTemplate implements Serializable {
    private String effectId;
    private String name;
    private GameProtocol.EffectType effectType;
    private GameProtocol.EffectCategory category;
    private int duration;
    private int value;
    private boolean canStack;
    private int maxStacks;
    private double chance;
    
    public StatusEffectTemplate() {
        this.chance = 1.0;
        this.maxStacks = 1;
    }
    
    public StatusEffect createInstance(String sourceHeroId, long sourcePlayerId) {
        StatusEffect effect = new StatusEffect(effectId, name, effectType, category, duration, 
                                               value, canStack, maxStacks);
        effect.setSourceHeroId(sourceHeroId);
        effect.setSourcePlayerId(sourcePlayerId);
        return effect;
    }
    
    public boolean shouldApply() {
        return Math.random() < chance;
    }
}
