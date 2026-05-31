package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class ActionResult implements Serializable {
    private boolean success;
    private String message;
    private GameProtocol.ActionType actionType;
    private String sourceHeroId;
    private long sourcePlayerId;
    private String targetHeroId;
    private long targetPlayerId;
    private int damageDealt;
    private int healingDone;
    private List<StatusEffect> appliedEffects;
    private boolean targetKilled;
    
    public static ActionResult fail(String message) {
        ActionResult result = new ActionResult();
        result.setSuccess(false);
        result.setMessage(message);
        return result;
    }
    
    public static ActionResult success(GameProtocol.ActionType actionType, HeroInstance source,
                                       HeroInstance target, int damage, int healing, 
                                       List<StatusEffect> effects) {
        ActionResult result = new ActionResult();
        result.setSuccess(true);
        result.setActionType(actionType);
        result.setSourceHeroId(source.getInstanceId());
        result.setSourcePlayerId(source.getPlayerId());
        if (target != null) {
            result.setTargetHeroId(target.getInstanceId());
            result.setTargetPlayerId(target.getPlayerId());
        }
        result.setDamageDealt(damage);
        result.setHealingDone(healing);
        result.setAppliedEffects(effects);
        return result;
    }
    
    public GameProtocol.ActionResult toProto() {
        GameProtocol.ActionResult.Builder builder = GameProtocol.ActionResult.newBuilder()
                .setSuccess(success)
                .setMessage(message != null ? message : "")
                .setSourceHeroId(sourceHeroId != null ? sourceHeroId : "")
                .setSourcePlayerId(sourcePlayerId)
                .setTargetHeroId(targetHeroId != null ? targetHeroId : "")
                .setTargetPlayerId(targetPlayerId)
                .setDamageDealt(damageDealt)
                .setHealingDone(healingDone)
                .setTargetKilled(targetKilled);
        
        if (actionType != null) {
            builder.setActionType(actionType);
        }
        
        if (appliedEffects != null) {
            for (StatusEffect effect : appliedEffects) {
                builder.addAppliedEffects(effect.toProto());
            }
        }
        
        return builder.build();
    }
}
