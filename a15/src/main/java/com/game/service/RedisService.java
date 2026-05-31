package com.game.service;

import com.game.model.GameState;
import com.game.model.Room;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
public class RedisService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final String ROOM_PREFIX = "game:room:";
    private static final String GAME_STATE_PREFIX = "game:state:";
    private static final String PLAYER_SESSION_PREFIX = "game:session:";
    private static final long ROOM_EXPIRE = 2 * 60 * 60;
    private static final long GAME_STATE_EXPIRE = 1 * 60 * 60;
    private static final long SESSION_EXPIRE = 30 * 60;
    
    public void saveRoom(Room room) {
        String key = ROOM_PREFIX + room.getRoomId();
        redisTemplate.opsForValue().set(key, room, ROOM_EXPIRE, TimeUnit.SECONDS);
    }
    
    public Room getRoom(String roomId) {
        String key = ROOM_PREFIX + roomId;
        Object obj = redisTemplate.opsForValue().get(key);
        if (obj instanceof Room) {
            return (Room) obj;
        }
        return null;
    }
    
    public void deleteRoom(String roomId) {
        String key = ROOM_PREFIX + roomId;
        redisTemplate.delete(key);
    }
    
    public void saveGameState(GameState gameState) {
        String key = GAME_STATE_PREFIX + gameState.getMatchId();
        redisTemplate.opsForValue().set(key, gameState, GAME_STATE_EXPIRE, TimeUnit.SECONDS);
    }
    
    public GameState getGameState(String matchId) {
        String key = GAME_STATE_PREFIX + matchId;
        Object obj = redisTemplate.opsForValue().get(key);
        if (obj instanceof GameState) {
            return (GameState) obj;
        }
        return null;
    }
    
    public void deleteGameState(String matchId) {
        String key = GAME_STATE_PREFIX + matchId;
        redisTemplate.delete(key);
    }
    
    public void savePlayerSession(long userId, String sessionId) {
        String key = PLAYER_SESSION_PREFIX + userId;
        redisTemplate.opsForValue().set(key, sessionId, SESSION_EXPIRE, TimeUnit.SECONDS);
    }
    
    public String getPlayerSession(long userId) {
        String key = PLAYER_SESSION_PREFIX + userId;
        Object obj = redisTemplate.opsForValue().get(key);
        return obj != null ? obj.toString() : null;
    }
    
    public void deletePlayerSession(long userId) {
        String key = PLAYER_SESSION_PREFIX + userId;
        redisTemplate.delete(key);
    }
    
    public void extendSession(long userId) {
        String key = PLAYER_SESSION_PREFIX + userId;
        redisTemplate.expire(key, SESSION_EXPIRE, TimeUnit.SECONDS);
    }
}
