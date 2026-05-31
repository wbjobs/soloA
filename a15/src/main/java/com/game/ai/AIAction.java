package com.game.ai;

import com.game.model.Position;
import com.game.protocol.GameProtocol;
import lombok.Data;

@Data
public class AIAction {
    private GameProtocol.ActionType type;
    private String heroId;
    private String targetId;
    private long targetPlayerId;
    private String skillId;
    private Position targetPosition;
    
    public static AIAction move(String heroId, Position targetPosition) {
        AIAction action = new AIAction();
        action.setType(GameProtocol.ActionType.ACTION_MOVE);
        action.setHeroId(heroId);
        action.setTargetPosition(targetPosition);
        return action;
    }
    
    public static AIAction attack(String heroId, String targetId, long targetPlayerId) {
        AIAction action = new AIAction();
        action.setType(GameProtocol.ActionType.ACTION_ATTACK);
        action.setHeroId(heroId);
        action.setTargetId(targetId);
        action.setTargetPlayerId(targetPlayerId);
        return action;
    }
    
    public static AIAction skill(String heroId, String skillId, String targetId, long targetPlayerId) {
        AIAction action = new AIAction();
        action.setType(GameProtocol.ActionType.ACTION_SKILL);
        action.setHeroId(heroId);
        action.setSkillId(skillId);
        action.setTargetId(targetId);
        action.setTargetPlayerId(targetPlayerId);
        return action;
    }
    
    public static AIAction skillArea(String heroId, String skillId, Position targetPosition) {
        AIAction action = new AIAction();
        action.setType(GameProtocol.ActionType.ACTION_SKILL);
        action.setHeroId(heroId);
        action.setSkillId(skillId);
        action.setTargetPosition(targetPosition);
        return action;
    }
    
    public static AIAction endTurn(String heroId) {
        AIAction action = new AIAction();
        action.setType(GameProtocol.ActionType.ACTION_END_TURN);
        action.setHeroId(heroId);
        return action;
    }
}
