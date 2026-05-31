package com.game.service;

import com.game.model.GameState;
import com.game.model.ReplayData;
import com.game.model.Room;
import com.game.protocol.GameProtocol;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

@Service
public class ReplayService {
    
    @Value("${game.replay.save-path:./replays}")
    private String replaySavePath;
    
    @Value("${game.replay.max-history:100}")
    private int maxHistory;
    
    private final ConcurrentHashMap<String, ReplayData> replayCache = new ConcurrentHashMap<>();
    
    public void saveReplay(Room room, GameState gameState) {
        try {
            ReplayData replayData = new ReplayData();
            replayData.setMatchId(gameState.getMatchId());
            replayData.setRoomId(room.getRoomId());
            replayData.setStartTime(room.getCreateTime());
            replayData.setEndTime(System.currentTimeMillis());
            replayData.setDurationSeconds((int)((replayData.getEndTime() - replayData.getStartTime()) / 1000));
            replayData.setWinnerTeamId(gameState.getWinnerTeamId());
            replayData.setTotalTurns(gameState.getCurrentTurn());
            replayData.setPlayers(new ArrayList<>(room.getPlayerList()));
            
            GameState initialState = new GameState();
            initialState.setMatchId(gameState.getMatchId());
            initialState.setMapWidth(gameState.getMapWidth());
            initialState.setMapHeight(gameState.getMapHeight());
            for (com.game.model.HeroInstance hero : gameState.getHeroes().values()) {
                com.game.model.HeroInstance cloneHero = cloneHero(hero);
                cloneHero.setCurrentHealth(cloneHero.getMaxHealth());
                cloneHero.setCurrentMana(cloneHero.getMaxMana());
                cloneHero.setAlive(true);
                cloneHero.setHasMoved(false);
                cloneHero.setHasActed(false);
                cloneHero.getStatusEffects().clear();
                cloneHero.getSkillCooldowns().clear();
                initialState.addHero(cloneHero);
            }
            replayData.setInitialState(initialState);
            replayData.setActionHistory(new ArrayList<>(gameState.getActionHistory()));
            
            Path replayDir = Paths.get(replaySavePath);
            if (!Files.exists(replayDir)) {
                Files.createDirectories(replayDir);
            }
            
            String fileName = gameState.getMatchId() + ".rep.gz";
            Path filePath = replayDir.resolve(fileName);
            
            try (FileOutputStream fos = new FileOutputStream(filePath.toFile());
                 GZIPOutputStream gzip = new GZIPOutputStream(fos);
                 ObjectOutputStream oos = new ObjectOutputStream(gzip)) {
                oos.writeObject(replayData);
            }
            
            replayCache.put(gameState.getMatchId(), replayData);
            
            while (replayCache.size() > maxHistory) {
                String oldestId = replayCache.keys().nextElement();
                replayCache.remove(oldestId);
            }
            
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
    public ReplayData loadReplay(String matchId) {
        ReplayData cached = replayCache.get(matchId);
        if (cached != null) {
            return cached;
        }
        
        try {
            Path filePath = Paths.get(replaySavePath, matchId + ".rep.gz");
            if (!Files.exists(filePath)) {
                return null;
            }
            
            try (FileInputStream fis = new FileInputStream(filePath.toFile());
                 GZIPInputStream gzip = new GZIPInputStream(fis);
                 ObjectInputStream ois = new ObjectInputStream(gzip)) {
                ReplayData data = (ReplayData) ois.readObject();
                replayCache.put(matchId, data);
                return data;
            }
            
        } catch (IOException | ClassNotFoundException e) {
            e.printStackTrace();
            return null;
        }
    }
    
    public String getReplayFilePath(String matchId) {
        return Paths.get(replaySavePath, matchId + ".rep.gz").toString();
    }
    
    public List<GameProtocol.MatchRecord> getReplayList(Long userId, int page, int pageSize) {
        List<GameProtocol.MatchRecord> records = new ArrayList<>();
        
        for (ReplayData replay : replayCache.values()) {
            if (userId == null || replay.getPlayers().stream()
                    .anyMatch(p -> p.getUserId() == userId)) {
                records.add(convertToMatchRecord(replay));
            }
        }
        
        records.sort((a, b) -> Long.compare(b.getStartTime(), a.getStartTime()));
        
        int start = (page - 1) * pageSize;
        int end = Math.min(start + pageSize, records.size());
        
        if (start >= records.size()) {
            return new ArrayList<>();
        }
        
        return records.subList(start, end);
    }
    
    private GameProtocol.MatchRecord convertToMatchRecord(ReplayData replay) {
        GameProtocol.MatchRecord.Builder builder = GameProtocol.MatchRecord.newBuilder()
                .setMatchId(replay.getMatchId())
                .setRoomId(replay.getRoomId())
                .setStartTime(replay.getStartTime())
                .setEndTime(replay.getEndTime())
                .setDuration(replay.getDurationSeconds())
                .setTotalTurns(replay.getTotalTurns());
        
        for (com.game.model.PlayerInfo player : replay.getPlayers()) {
            builder.addPlayers(player.toProto());
        }
        
        return builder.build();
    }
    
    private com.game.model.HeroInstance cloneHero(com.game.model.HeroInstance original) {
        com.game.model.HeroInstance clone = new com.game.model.HeroInstance();
        clone.setHeroId(original.getHeroId());
        clone.setInstanceId(original.getInstanceId());
        clone.setName(original.getName());
        clone.setPlayerId(original.getPlayerId());
        clone.setTeamId(original.getTeamId());
        clone.setMaxHealth(original.getMaxHealth());
        clone.setCurrentHealth(original.getCurrentHealth());
        clone.setMaxMana(original.getMaxMana());
        clone.setCurrentMana(original.getCurrentMana());
        clone.setBaseAttack(original.getBaseAttack());
        clone.setBaseDefense(original.getBaseDefense());
        clone.setBaseSpeed(original.getBaseSpeed());
        clone.setMoveRange(original.getMoveRange());
        clone.setAttackRange(original.getAttackRange());
        clone.setPosition(new com.game.model.Position(
                original.getPosition().getX(), original.getPosition().getY()));
        clone.setSkills(new java.util.HashMap<>(original.getSkills()));
        clone.setAlive(original.isAlive());
        clone.setHasMoved(original.isHasMoved());
        clone.setHasActed(original.isHasActed());
        clone.setStatusEffects(new ArrayList<>(original.getStatusEffects()));
        clone.setSkillCooldowns(new java.util.HashMap<>(original.getSkillCooldowns()));
        return clone;
    }
}
