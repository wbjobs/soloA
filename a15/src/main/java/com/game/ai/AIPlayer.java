package com.game.ai;

import com.game.model.PlayerInfo;
import com.game.protocol.GameProtocol;
import lombok.Data;

@Data
public class AIPlayer {
    private long userId;
    private PlayerInfo playerInfo;
    private GameProtocol.AIDifficulty difficulty;
    private String selectedHeroId;
}
