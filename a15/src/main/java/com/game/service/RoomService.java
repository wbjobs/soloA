package com.game.service;

import com.game.model.PlayerInfo;
import com.game.model.Room;
import com.game.protocol.GameProtocol;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class RoomService {
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private RedisService redisService;
    
    @Value("${game.room.max-players:4}")
    private int maxPlayersPerRoom;
    
    @Value("${game.room.max-rooms:1000}")
    private int maxRooms;
    
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<Long, String> playerRooms = new ConcurrentHashMap<>();
    
    public Map<String, Object> createRoom(Long ownerId, String roomName, int maxPlayers, 
                                           String password, int gameMode) {
        Map<String, Object> result = new java.util.HashMap<>();
        
        if (rooms.size() >= maxRooms) {
            result.put("success", false);
            result.put("message", "房间数量已达上限");
            return result;
        }
        
        if (playerRooms.containsKey(ownerId)) {
            result.put("success", false);
            result.put("message", "您已经在一个房间中");
            return result;
        }
        
        Room room = new Room();
        room.setRoomName(roomName != null ? roomName : "房间" + room.getRoomId().substring(0, 6));
        room.setOwnerId(ownerId);
        room.setMaxPlayers(Math.min(maxPlayers, maxPlayersPerRoom));
        room.setPassword(password);
        room.setGameMode(gameMode);
        
        PlayerInfo playerInfo = userService.getPlayerInfo(ownerId);
        if (playerInfo == null) {
            result.put("success", false);
            result.put("message", "用户信息不存在");
            return result;
        }
        
        room.addPlayer(playerInfo, null);
        rooms.put(room.getRoomId(), room);
        playerRooms.put(ownerId, room.getRoomId());
        
        redisService.saveRoom(room);
        
        result.put("success", true);
        result.put("message", "房间创建成功");
        result.put("room", room);
        return result;
    }
    
    public Map<String, Object> joinRoom(Long userId, String roomId, String password) {
        Map<String, Object> result = new java.util.HashMap<>();
        
        if (playerRooms.containsKey(userId)) {
            result.put("success", false);
            result.put("message", "您已经在一个房间中");
            return result;
        }
        
        Room room = rooms.get(roomId);
        if (room == null) {
            room = redisService.getRoom(roomId);
            if (room == null) {
                result.put("success", false);
                result.put("message", "房间不存在");
                return result;
            }
        }
        
        if (room.getStatus() != GameProtocol.RoomStatus.ROOM_WAITING &&
            room.getStatus() != GameProtocol.RoomStatus.ROOM_READY) {
            result.put("success", false);
            result.put("message", "房间已开始游戏");
            return result;
        }
        
        if (room.isFull()) {
            result.put("success", false);
            result.put("message", "房间已满");
            return result;
        }
        
        PlayerInfo playerInfo = userService.getPlayerInfo(userId);
        if (playerInfo == null) {
            result.put("success", false);
            result.put("message", "用户信息不存在");
            return result;
        }
        
        if (!room.addPlayer(playerInfo, password)) {
            result.put("success", false);
            result.put("message", "密码错误或加入失败");
            return result;
        }
        
        playerRooms.put(userId, roomId);
        redisService.saveRoom(room);
        
        result.put("success", true);
        result.put("message", "加入房间成功");
        result.put("room", room);
        return result;
    }
    
    public Map<String, Object> leaveRoom(Long userId) {
        Map<String, Object> result = new java.util.HashMap<>();
        
        String roomId = playerRooms.get(userId);
        if (roomId == null) {
            result.put("success", false);
            result.put("message", "您不在任何房间中");
            return result;
        }
        
        Room room = rooms.get(roomId);
        if (room != null) {
            room.removePlayer(userId);
            playerRooms.remove(userId);
            
            if (room.isEmpty()) {
                rooms.remove(roomId);
                redisService.deleteRoom(roomId);
            } else {
                redisService.saveRoom(room);
            }
        }
        
        result.put("success", true);
        result.put("message", "退出房间成功");
        result.put("room", room);
        return result;
    }
    
    public Map<String, Object> setPlayerReady(Long userId, boolean ready) {
        Map<String, Object> result = new java.util.HashMap<>();
        
        String roomId = playerRooms.get(userId);
        if (roomId == null) {
            result.put("success", false);
            result.put("message", "您不在任何房间中");
            return result;
        }
        
        Room room = rooms.get(roomId);
        if (room == null) {
            result.put("success", false);
            result.put("message", "房间不存在");
            return result;
        }
        
        if (room.getStatus() != GameProtocol.RoomStatus.ROOM_WAITING &&
            room.getStatus() != GameProtocol.RoomStatus.ROOM_READY) {
            result.put("success", false);
            result.put("message", "游戏已开始");
            return result;
        }
        
        room.setPlayerReady(userId, ready);
        redisService.saveRoom(room);
        
        result.put("success", true);
        result.put("message", ready ? "已准备" : "取消准备");
        result.put("room", room);
        return result;
    }
    
    public Map<String, Object> selectHero(Long userId, String heroId, int position) {
        Map<String, Object> result = new java.util.HashMap<>();
        
        String roomId = playerRooms.get(userId);
        if (roomId == null) {
            result.put("success", false);
            result.put("message", "您不在任何房间中");
            return result;
        }
        
        Room room = rooms.get(roomId);
        if (room == null) {
            result.put("success", false);
            result.put("message", "房间不存在");
            return result;
        }
        
        if (room.getStatus() != GameProtocol.RoomStatus.ROOM_WAITING &&
            room.getStatus() != GameProtocol.RoomStatus.ROOM_READY) {
            result.put("success", false);
            result.put("message", "游戏已开始");
            return result;
        }
        
        room.selectHero(userId, heroId, position);
        redisService.saveRoom(room);
        
        result.put("success", true);
        result.put("message", "英雄选择成功");
        result.put("room", room);
        return result;
    }
    
    public Room getRoom(String roomId) {
        Room room = rooms.get(roomId);
        if (room == null) {
            room = redisService.getRoom(roomId);
            if (room != null) {
                rooms.put(roomId, room);
            }
        }
        return room;
    }
    
    public Room getRoomByPlayer(Long userId) {
        String roomId = playerRooms.get(userId);
        if (roomId == null) return null;
        return getRoom(roomId);
    }
    
    public String getRoomIdByPlayer(Long userId) {
        return playerRooms.get(userId);
    }
    
    public List<Room> getRoomList(int page, int pageSize, boolean onlyAvailable) {
        List<Room> allRooms = new ArrayList<>(rooms.values());
        
        if (onlyAvailable) {
            allRooms = allRooms.stream()
                    .filter(r -> (r.getStatus() == GameProtocol.RoomStatus.ROOM_WAITING ||
                                  r.getStatus() == GameProtocol.RoomStatus.ROOM_READY) &&
                                !r.isFull())
                    .collect(Collectors.toList());
        }
        
        int start = (page - 1) * pageSize;
        int end = Math.min(start + pageSize, allRooms.size());
        
        if (start >= allRooms.size()) {
            return new ArrayList<>();
        }
        
        return allRooms.subList(start, end);
    }
    
    public int getTotalRooms() {
        return rooms.size();
    }
    
    public void setRoomPlaying(String roomId) {
        Room room = rooms.get(roomId);
        if (room != null) {
            room.startGame();
            redisService.saveRoom(room);
        }
    }
    
    public void setRoomEnded(String roomId) {
        Room room = rooms.get(roomId);
        if (room != null) {
            room.endGame();
            for (Long userId : new ArrayList<>(playerRooms.keySet())) {
                if (roomId.equals(playerRooms.get(userId))) {
                    playerRooms.remove(userId);
                }
            }
            rooms.remove(roomId);
            redisService.deleteRoom(roomId);
        }
    }
    
    public void handlePlayerDisconnect(Long userId) {
        String roomId = playerRooms.get(userId);
        if (roomId != null) {
            Room room = rooms.get(roomId);
            if (room != null) {
                PlayerInfo player = room.getPlayers().get(userId);
                if (player != null) {
                    player.setStatus(GameProtocol.PlayerStatus.PLAYER_DISCONNECTED);
                    redisService.saveRoom(room);
                }
            }
        }
    }
    
    public Room handleReconnect(Long userId, String roomId) {
        Room room = rooms.get(roomId);
        if (room != null && room.hasPlayer(userId)) {
            PlayerInfo player = room.getPlayers().get(userId);
            if (player != null) {
                player.setStatus(GameProtocol.PlayerStatus.PLAYER_PLAYING);
                playerRooms.put(userId, roomId);
                redisService.saveRoom(room);
                return room;
            }
        }
        return null;
    }
}
