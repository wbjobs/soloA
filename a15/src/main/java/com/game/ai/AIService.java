package com.game.ai;

import com.game.model.*;
import com.game.protocol.GameProtocol;
import com.game.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AIService {
    
    @Autowired
    private AIStrategy aiStrategy;
    
    @Autowired
    private GameService gameService;
    
    @Autowired
    private RoomService roomService;
    
    @Autowired
    private MessageExecutorService executorService;
    
    private final Map<String, AIGameContext> aiGames = new ConcurrentHashMap<>();
    private final Map<Long, AIPlayer> aiPlayers = new ConcurrentHashMap<>();
    
    private static final long AI_THINK_TIME_MS = 1500;
    
    public void init() {
        log.info("AI Service initialized");
    }
    
    public Map<String, Object> createAIRoom(Long userId, int aiCount, 
                                            GameProtocol.AIDifficulty difficulty, String heroId) {
        Map<String, Object> result = new HashMap<>();
        
        if (aiCount < 1 || aiCount > 3) {
            result.put("success", false);
            result.put("message", "AI数量必须在1-3之间");
            return result;
        }
        
        Map<String, Object> createResult = roomService.createRoom(
                userId, "AI对战房间", aiCount + 1, null, 1);
        
        if (!(Boolean) createResult.get("success")) {
            return createResult;
        }
        
        Room room = (Room) createResult.get("room");
        
        for (int i = 0; i < aiCount; i++) {
            Long aiUserId = generateAIUserId(i);
            AIPlayer aiPlayer = createAIPlayer(aiUserId, i, difficulty, heroId);
            aiPlayers.put(aiUserId, aiPlayer);
            
            PlayerInfo aiPlayerInfo = aiPlayer.getPlayerInfo();
            room.addPlayer(aiPlayerInfo, null);
        }
        
        PlayerInfo humanPlayer = room.getPlayers().get(userId);
        if (humanPlayer != null) {
            humanPlayer.setTeamId(1);
            humanPlayer.setReady(true);
            humanPlayer.setStatus(GameProtocol.PlayerStatus.PLAYER_READY);
            
            if (heroId != null && !heroId.isEmpty()) {
                humanPlayer.setSelectedHeroId(heroId);
            }
        }
        
        for (Map.Entry<Long, PlayerInfo> entry : room.getPlayers().entrySet()) {
            if (entry.getValue().getUserId() != userId) {
                PlayerInfo ai = entry.getValue();
                ai.setTeamId(2);
                ai.setReady(true);
                ai.setStatus(GameProtocol.PlayerStatus.PLAYER_READY);
                
                AIPlayer aiPlayer = aiPlayers.get(ai.getUserId());
                if (aiPlayer != null) {
                    ai.setSelectedHeroId(aiPlayer.getSelectedHeroId());
                }
            }
        }
        
        roomService.setPlayerReady(userId, true);
        
        AIGameContext context = new AIGameContext();
        context.setRoomId(room.getRoomId());
        context.setDifficulty(difficulty);
        context.setActive(true);
        aiGames.put(room.getRoomId(), context);
        
        result.put("success", true);
        result.put("message", "AI房间创建成功");
        result.put("room", room);
        return result;
    }
    
    public void startAIGame(String roomId) {
        AIGameContext context = aiGames.get(roomId);
        if (context == null) return;
        
        context.setGameStarted(true);
        log.info("AI game started for room: {}", roomId);
    }
    
    public void handleAITurn(String roomId, GameState gameState) {
        AIGameContext context = aiGames.get(roomId);
        if (context == null || !context.isActive()) return;
        
        long currentPlayerId = gameState.getCurrentPlayerId();
        
        if (!isAIPlayer(currentPlayerId)) {
            return;
        }
        
        executorService.schedule(() -> executeAIAction(roomId, gameState, currentPlayerId), 
                                 AI_THINK_TIME_MS, TimeUnit.MILLISECONDS);
    }
    
    private void executeAIAction(String roomId, GameState gameState, long aiPlayerId) {
        try {
            AIGameContext context = aiGames.get(roomId);
            if (context == null || !context.isActive()) return;
            
            if (gameState.isGameOver()) {
                context.setActive(false);
                return;
            }
            
            HeroInstance aiHero = gameState.getHeroByPlayerId(aiPlayerId);
            if (aiHero == null || !aiHero.isAlive()) {
                log.debug("AI hero not found or dead, skipping turn");
                GameProtocol.ActionRequest endTurn = GameProtocol.ActionRequest.newBuilder()
                        .setActionType(GameProtocol.ActionType.ACTION_END_TURN)
                        .setHeroId(aiHero != null ? aiHero.getInstanceId() : "")
                        .build();
                gameService.handleAction(aiPlayerId, endTurn);
                return;
            }
            
            AIAction action = aiStrategy.decideAction(aiHero, gameState, context.getDifficulty());
            GameProtocol.ActionRequest request = convertToRequest(action);
            gameService.handleAction(aiPlayerId, request);
            
            if (!gameState.isGameOver() && !aiHero.isHasMoved() && !aiHero.isHasActed()) {
                executorService.schedule(() -> executeAIAction(roomId, gameState, aiPlayerId),
                                         500, TimeUnit.MILLISECONDS);
            } else if (gameState.getCurrentPlayerId() != aiPlayerId && 
                       isAIPlayer(gameState.getCurrentPlayerId())) {
                executorService.schedule(() -> executeAIAction(roomId, gameState, gameState.getCurrentPlayerId()),
                                         AI_THINK_TIME_MS, TimeUnit.MILLISECONDS);
            }
            
        } catch (Exception e) {
            log.error("Error executing AI action", e);
        }
    }
    
    private GameProtocol.ActionRequest convertToRequest(AIAction action) {
        GameProtocol.ActionRequest.Builder builder = GameProtocol.ActionRequest.newBuilder()
                .setActionType(action.getType())
                .setHeroId(action.getHeroId() != null ? action.getHeroId() : "")
                .setTimestamp(System.currentTimeMillis());
        
        if (action.getTargetPosition() != null) {
            builder.setTargetPosition(action.getTargetPosition().toProto());
        }
        
        if (action.getTargetPlayerId() > 0) {
            builder.setTargetPlayerId(action.getTargetPlayerId());
        }
        
        if (action.getTargetId() != null) {
            builder.setTargetHeroId(action.getTargetId());
        }
        
        if (action.getSkillId() != null) {
            builder.setSkillId(action.getSkillId());
        }
        
        return builder.build();
    }
    
    public boolean isAIPlayer(long userId) {
        return userId >= 1000000;
    }
    
    private long generateAIUserId(int index) {
        return 1000000L + index + new Random().nextInt(1000);
    }
    
    private AIPlayer createAIPlayer(Long userId, int index, 
                                    GameProtocol.AIDifficulty difficulty, String humanHeroId) {
        AIPlayer aiPlayer = new AIPlayer();
        aiPlayer.setUserId(userId);
        
        String[] aiNames = {"Alpha", "Beta", "Gamma", "Delta"};
        String aiName = aiNames[index % aiNames.length];
        
        String[] heroPool = {"warrior_001", "mage_001", "healer_001", "archer_001"};
        String selectedHero;
        
        if (humanHeroId != null && !humanHeroId.isEmpty()) {
            List<String> availableHeroes = new ArrayList<>();
            for (String hero : heroPool) {
                if (!hero.equals(humanHeroId)) {
                    availableHeroes.add(hero);
                }
            }
            selectedHero = availableHeroes.get(new Random().nextInt(availableHeroes.size()));
        } else {
            selectedHero = heroPool[new Random().nextInt(heroPool.length)];
        }
        
        PlayerInfo playerInfo = new PlayerInfo();
        playerInfo.setUserId(userId);
        playerInfo.setUsername("AI_" + aiName);
        playerInfo.setNickname("AI " + aiName);
        playerInfo.setAvatar("");
        playerInfo.setLevel(10 + new Random().nextInt(20));
        playerInfo.setRating(1400 + new Random().nextInt(300));
        playerInfo.setStatus(GameProtocol.PlayerStatus.PLAYER_ONLINE);
        playerInfo.setSelectedHeroId(selectedHero);
        
        aiPlayer.setPlayerInfo(playerInfo);
        aiPlayer.setDifficulty(difficulty);
        aiPlayer.setSelectedHeroId(selectedHero);
        
        return aiPlayer;
    }
    
    public void endAIGame(String roomId) {
        AIGameContext context = aiGames.remove(roomId);
        if (context != null) {
            context.setActive(false);
            log.info("AI game ended for room: {}", roomId);
        }
    }
    
    public GameProtocol.AIDifficulty getAIDifficulty(String roomId) {
        AIGameContext context = aiGames.get(roomId);
        return context != null ? context.getDifficulty() : GameProtocol.AIDifficulty.AI_NORMAL;
    }
}
