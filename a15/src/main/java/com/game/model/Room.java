package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class Room implements Serializable {
    private String roomId;
    private String roomName;
    private long ownerId;
    private int maxPlayers;
    private GameProtocol.RoomStatus status;
    private Map<Long, PlayerInfo> players;
    private int gameMode;
    private String password;
    private long createTime;
    private String matchId;
    private GameState gameState;
    
    public Room() {
        this.roomId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        this.maxPlayers = 4;
        this.status = GameProtocol.RoomStatus.ROOM_WAITING;
        this.players = new HashMap<>();
        this.gameMode = 0;
        this.createTime = System.currentTimeMillis();
    }
    
    public int getCurrentPlayers() {
        return (int) players.values().stream()
                .filter(p -> p.getStatus() == GameProtocol.PlayerStatus.PLAYER_IN_ROOM ||
                             p.getStatus() == GameProtocol.PlayerStatus.PLAYER_READY)
                .count();
    }
    
    public boolean isFull() {
        return getCurrentPlayers() >= maxPlayers;
    }
    
    public boolean isEmpty() {
        return getCurrentPlayers() == 0;
    }
    
    public boolean hasPlayer(long userId) {
        return players.containsKey(userId);
    }
    
    public boolean addPlayer(PlayerInfo player, String password) {
        if (isFull()) return false;
        if (this.password != null && !this.password.isEmpty() && !this.password.equals(password)) {
            return false;
        }
        
        player.setStatus(GameProtocol.PlayerStatus.PLAYER_IN_ROOM);
        player.setReady(false);
        
        int[] availableTeams = {1, 2};
        for (int team : availableTeams) {
            int teamCount = (int) players.values().stream()
                    .filter(p -> p.getTeamId() == team && 
                            (p.getStatus() == GameProtocol.PlayerStatus.PLAYER_IN_ROOM ||
                             p.getStatus() == GameProtocol.PlayerStatus.PLAYER_READY))
                    .count();
            if (teamCount < maxPlayers / 2) {
                player.setTeamId(team);
                break;
            }
        }
        
        player.setPosition(getCurrentPlayers());
        players.put(player.getUserId(), player);
        
        return true;
    }
    
    public void removePlayer(long userId) {
        PlayerInfo player = players.get(userId);
        if (player != null) {
            player.setStatus(GameProtocol.PlayerStatus.PLAYER_ONLINE);
            player.setReady(false);
            players.remove(userId);
            
            if (userId == ownerId && !players.isEmpty()) {
                ownerId = players.values().stream()
                        .findFirst()
                        .map(PlayerInfo::getUserId)
                        .orElse(0L);
            }
        }
    }
    
    public void setPlayerReady(long userId, boolean ready) {
        PlayerInfo player = players.get(userId);
        if (player != null) {
            player.setReady(ready);
            player.setStatus(ready ? GameProtocol.PlayerStatus.PLAYER_READY : 
                                      GameProtocol.PlayerStatus.PLAYER_IN_ROOM);
        }
        checkAllReady();
    }
    
    public void selectHero(long userId, String heroId, int position) {
        PlayerInfo player = players.get(userId);
        if (player != null) {
            player.setSelectedHeroId(heroId);
            if (position >= 0 && position < maxPlayers) {
                player.setPosition(position);
            }
        }
    }
    
    private void checkAllReady() {
        long readyCount = players.values().stream()
                .filter(p -> p.getStatus() == GameProtocol.PlayerStatus.PLAYER_READY)
                .count();
        if (readyCount == getCurrentPlayers() && getCurrentPlayers() >= 2) {
            status = GameProtocol.RoomStatus.ROOM_READY;
        } else {
            status = GameProtocol.RoomStatus.ROOM_WAITING;
        }
    }
    
    public void startGame() {
        status = GameProtocol.RoomStatus.ROOM_PLAYING;
        for (PlayerInfo player : players.values()) {
            player.setStatus(GameProtocol.PlayerStatus.PLAYER_PLAYING);
        }
    }
    
    public void endGame() {
        status = GameProtocol.RoomStatus.ROOM_ENDED;
        for (PlayerInfo player : players.values()) {
            player.setStatus(GameProtocol.PlayerStatus.PLAYER_IN_ROOM);
            player.setReady(false);
        }
    }
    
    public List<PlayerInfo> getPlayerList() {
        return new ArrayList<>(players.values());
    }
    
    public GameProtocol.RoomInfo toProto() {
        GameProtocol.RoomInfo.Builder builder = GameProtocol.RoomInfo.newBuilder()
                .setRoomId(roomId)
                .setRoomName(roomName != null ? roomName : "")
                .setOwnerId(ownerId)
                .setMaxPlayers(maxPlayers)
                .setCurrentPlayers(getCurrentPlayers())
                .setStatus(status)
                .setGameMode(gameMode)
                .setCreateTime(createTime);
        
        for (PlayerInfo player : players.values()) {
            builder.addPlayers(player.toProto());
        }
        
        return builder.build();
    }
}
