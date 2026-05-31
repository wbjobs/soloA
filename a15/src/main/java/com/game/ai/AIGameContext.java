package com.game.ai;

import com.game.protocol.GameProtocol;
import lombok.Data;

@Data
public class AIGameContext {
    private String roomId;
    private GameProtocol.AIDifficulty difficulty;
    private boolean active;
    private boolean gameStarted;
}
