package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;

@Data
public class StatusEffect implements Serializable {
    private String effectId;
    private String name;
    private GameProtocol.EffectType effectType;
    private GameProtocol.EffectCategory category;
    private int duration;
    private int remainingTurns;
    private int stacks;
    private int maxStacks;
    private int value;
    private boolean canStack;
    private String sourceHeroId;
    private long sourcePlayerId;
    
    public StatusEffect() {}
    
    public StatusEffect(String effectId, String name, GameProtocol.EffectType effectType,
                        GameProtocol.EffectCategory category, int duration, int value,
                        boolean canStack, int maxStacks) {
        this.effectId = effectId;
        this.name = name;
        this.effectType = effectType;
        this.category = category;
        this.duration = duration;
        this.remainingTurns = duration;
        this.value = value;
        this.canStack = canStack;
        this.maxStacks = maxStacks;
        this.stacks = 1;
    }
    
    public GameProtocol.StatusEffectData toProto() {
        return GameProtocol.StatusEffectData.newBuilder()
                .setEffectId(effectId)
                .setName(name)
                .setEffectType(effectType)
                .setCategory(category)
                .setDuration(duration)
                .setRemainingTurns(remainingTurns)
                .setStacks(stacks)
                .setValue(value)
                .build();
    }
    
    public void tick() {
        remainingTurns--;
    }
    
    public boolean isExpired() {
        return remainingTurns <= 0;
    }
    
    public void addStack() {
        if (canStack && stacks < maxStacks) {
            stacks++;
        }
    }
    
    public boolean isControlEffect() {
        return effectType == GameProtocol.EffectType.EFFECT_CONTROL;
    }
}
