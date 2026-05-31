package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;

@Data
public class PlayerInfo implements Serializable {
    private long userId;
    private String username;
    private String nickname;
    private String avatar;
    private int level;
    private int rating;
    private GameProtocol.PlayerStatus status;
    private String selectedHeroId;
    private int teamId;
    private int position;
    private boolean ready;
    private String sessionId;
    private String token;
    
    public PlayerInfo() {
        this.status = GameProtocol.PlayerStatus.PLAYER_OFFLINE;
        this.teamId = 1;
        this.position = 0;
        this.ready = false;
    }
    
    public GameProtocol.PlayerInfo toProto() {
        return GameProtocol.PlayerInfo.newBuilder()
                .setUserId(userId)
                .setUsername(username != null ? username : "")
                .setNickname(nickname != null ? nickname : "")
                .setAvatar(avatar != null ? avatar : "")
                .setLevel(level)
                .setRating(rating)
                .setStatus(status)
                .setSelectedHeroId(selectedHeroId != null ? selectedHeroId : "")
                .setTeamId(teamId)
                .setPosition(position)
                .setIsReady(ready)
                .build();
    }
}
