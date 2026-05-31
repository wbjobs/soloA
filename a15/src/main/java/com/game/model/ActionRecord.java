package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class ActionRecord implements Serializable {
    private int turnNumber;
    private GameProtocol.ActionType actionType;
    private long timestamp;
    private long sourcePlayerId;
    private String sourceHeroId;
    private Long targetPlayerId;
    private String targetHeroId;
    private int damageDealt;
    private int healingDone;
    private List<StatusEffect> appliedEffects;
}
