package com.game.controller;

import com.game.model.*;
import com.game.protocol.GameProtocol;
import com.game.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class GameApiController {
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private RoomService roomService;
    
    @Autowired
    private GameService gameService;
    
    @Autowired
    private ReplayService replayService;
    
    @Autowired
    private LeaderboardService leaderboardService;
    
    @Autowired
    private FriendService friendService;
    
    @Autowired
    private InviteService inviteService;
    
    @Autowired(required = false)
    private com.game.ai.AIService aiService;
    
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> request) {
        Map<String, Object> result = userService.register(
                request.get("username"),
                request.get("password"),
                request.get("email"),
                request.get("nickname")
        );
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        Map<String, Object> result = userService.login(
                request.get("username"),
                request.get("password")
        );
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/rooms/create")
    public ResponseEntity<Map<String, Object>> createRoom(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, Object> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = roomService.createRoom(
                userId,
                (String) request.get("roomName"),
                request.containsKey("maxPlayers") ? (Integer) request.get("maxPlayers") : 4,
                (String) request.get("password"),
                request.containsKey("gameMode") ? (Integer) request.get("gameMode") : 0
        );
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/rooms/join")
    public ResponseEntity<Map<String, Object>> joinRoom(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, String> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = roomService.joinRoom(
                userId,
                request.get("roomId"),
                request.get("password")
        );
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/rooms/leave")
    public ResponseEntity<Map<String, Object>> leaveRoom(
            @RequestHeader("Authorization") String token) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = roomService.leaveRoom(userId);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/rooms")
    public ResponseEntity<Map<String, Object>> getRoomList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(defaultValue = "false") boolean onlyAvailable) {
        
        List<Room> rooms = roomService.getRoomList(page, pageSize, onlyAvailable);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("total", roomService.getTotalRooms());
        result.put("rooms", rooms);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<Map<String, Object>> getRoomInfo(@PathVariable String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return ResponseEntity.status(404).body(errorResponse("Room not found"));
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("room", room);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/players/{userId}")
    public ResponseEntity<Map<String, Object>> getPlayerInfo(@PathVariable Long userId) {
        PlayerInfo playerInfo = userService.getPlayerInfo(userId);
        if (playerInfo == null) {
            return ResponseEntity.status(404).body(errorResponse("Player not found"));
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("player", playerInfo);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/game/{matchId}")
    public ResponseEntity<Map<String, Object>> getGameState(@PathVariable String matchId) {
        GameState gameState = gameService.getGameState(matchId);
        if (gameState == null) {
            return ResponseEntity.status(404).body(errorResponse("Game not found"));
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("gameState", gameState);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/replays")
    public ResponseEntity<Map<String, Object>> getReplayList(
            @RequestParam(required = false) Long userId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        
        List<GameProtocol.MatchRecord> records = replayService.getReplayList(userId, page, pageSize);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("total", records.size());
        result.put("replays", records);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/replays/{matchId}")
    public ResponseEntity<Map<String, Object>> getReplay(@PathVariable String matchId) {
        ReplayData replayData = replayService.loadReplay(matchId);
        if (replayData == null) {
            return ResponseEntity.status(404).body(errorResponse("Replay not found"));
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("replay", replayData);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/leaderboard")
    public ResponseEntity<Map<String, Object>> getLeaderboard(
            @RequestParam(defaultValue = "0") int type,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "Authorization", required = false) String token) {
        
        GameProtocol.LeaderboardType leaderboardType = GameProtocol.LeaderboardType.forNumber(type);
        if (leaderboardType == null) {
            leaderboardType = GameProtocol.LeaderboardType.LEADERBOARD_RATING;
        }
        
        Long userId = null;
        if (token != null && !token.isEmpty()) {
            userId = userService.validateToken(token.replace("Bearer ", ""));
        }
        
        Map<String, Object> result = leaderboardService.getLeaderboard(leaderboardType, page, pageSize, userId);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/friends")
    public ResponseEntity<Map<String, Object>> getFriendList(
            @RequestHeader("Authorization") String token) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        List<Map<String, Object>> friends = friendService.getFriendList(userId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("friends", friends);
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/friends/add")
    public ResponseEntity<Map<String, Object>> addFriend(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, String> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = friendService.sendFriendRequest(
                userId, request.get("username"), request.get("message"));
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/friends/accept")
    public ResponseEntity<Map<String, Object>> acceptFriend(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, Object> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Long friendId = ((Number) request.get("friendId")).longValue();
        boolean accept = (Boolean) request.getOrDefault("accept", true);
        
        Map<String, Object> result = friendService.acceptFriendRequest(userId, friendId, accept);
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/friends/remove")
    public ResponseEntity<Map<String, Object>> removeFriend(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, Object> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Long friendId = ((Number) request.get("friendId")).longValue();
        Map<String, Object> result = friendService.removeFriend(userId, friendId);
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/friends/requests")
    public ResponseEntity<Map<String, Object>> getFriendRequests(
            @RequestHeader("Authorization") String token) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = friendService.getFriendRequests(userId);
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/invites/send")
    public ResponseEntity<Map<String, Object>> sendInvite(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, Object> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Long friendId = ((Number) request.get("friendId")).longValue();
        String roomId = (String) request.get("roomId");
        String message = (String) request.getOrDefault("message", "");
        
        Map<String, Object> result = inviteService.sendGameInvite(userId, friendId, roomId, message);
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/invites/accept")
    public ResponseEntity<Map<String, Object>> acceptInvite(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, String> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = inviteService.acceptInvite(userId, request.get("inviteId"));
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/invites/decline")
    public ResponseEntity<Map<String, Object>> declineInvite(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, String> request) {
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        Map<String, Object> result = inviteService.declineInvite(userId, request.get("inviteId"));
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/ai/create-room")
    public ResponseEntity<Map<String, Object>> createAIRoom(
            @RequestHeader("Authorization") String token,
            @RequestBody Map<String, Object> request) {
        
        if (aiService == null) {
            return ResponseEntity.status(503).body(errorResponse("AI service not available"));
        }
        
        Long userId = userService.validateToken(token.replace("Bearer ", ""));
        if (userId == null) {
            return ResponseEntity.status(401).body(errorResponse("Invalid token"));
        }
        
        int aiCount = request.containsKey("aiCount") ? ((Number) request.get("aiCount")).intValue() : 1;
        int difficultyInt = request.containsKey("difficulty") ? ((Number) request.get("difficulty")).intValue() : 1;
        GameProtocol.AIDifficulty difficulty = GameProtocol.AIDifficulty.forNumber(difficultyInt);
        if (difficulty == null) {
            difficulty = GameProtocol.AIDifficulty.AI_NORMAL;
        }
        String heroId = (String) request.get("heroId");
        
        Map<String, Object> result = aiService.createAIRoom(userId, aiCount, difficulty, heroId);
        return ResponseEntity.ok(result);
    }
    
    private Map<String, Object> errorResponse(String message) {
        Map<String, Object> error = new HashMap<>();
        error.put("success", false);
        error.put("message", message);
        return error;
    }
}
