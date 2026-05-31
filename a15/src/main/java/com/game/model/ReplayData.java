package com.game.model;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class ReplayData implements Serializable {
    private String matchId;
    private String roomId;
    private long startTime;
    private long endTime;
    private int durationSeconds;
    private int winnerTeamId;
    private int totalTurns;
    private List<PlayerInfo> players;
    private GameState initialState;
    private List<ActionRecord> actionHistory;
    
    public ReplayData() {}
}
