package com.game.service;

import com.game.entity.GameMatch;
import com.game.entity.MatchPlayer;
import com.game.entity.PlayerStats;
import com.game.mapper.GameMatchMapper;
import com.game.mapper.MatchPlayerMapper;
import com.game.mapper.PlayerStatsMapper;
import com.game.model.*;
import com.game.protocol.GameProtocol;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

@Service
public class GameService {
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private RoomService roomService;
    
    @Autowired
    private RedisService redisService;
    
    @Autowired
    private ReplayService replayService;
    
    @Autowired
    private GameMatchMapper gameMatchMapper;
    
    @Autowired
    private MatchPlayerMapper matchPlayerMapper;
    
    @Autowired
    private PlayerStatsMapper playerStatsMapper;
    
    @Autowired(required = false)
    private com.game.ai.AIService aiService;
    
    private final Map<String, GameState> activeGames = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> gameLocks = new ConcurrentHashMap<>();
    
    private ReentrantLock getGameLock(String matchId) {
        return gameLocks.computeIfAbsent(matchId, k -> new ReentrantLock());
    }
    
    public Map<String, Object> startGame(Long ownerId) {
        Map<String, Object> result = new HashMap<>();
        
        Room room = roomService.getRoomByPlayer(ownerId);
        if (room == null) {
            result.put("success", false);
            result.put("message", "房间不存在");
            return result;
        }
        
        if (room.getOwnerId() != ownerId) {
            result.put("success", false);
            result.put("message", "只有房主可以开始游戏");
            return result;
        }
        
        if (room.getStatus() != GameProtocol.RoomStatus.ROOM_READY) {
            result.put("success", false);
            result.put("message", "需要所有玩家准备后才能开始");
            return result;
        }
        
        if (room.getCurrentPlayers() < 2) {
            result.put("success", false);
            result.put("message", "至少需要2名玩家才能开始游戏");
            return result;
        }
        
        GameState gameState = initializeGameState(room);
        if (gameState == null) {
            result.put("success", false);
            result.put("message", "游戏初始化失败");
            return result;
        }
        
        activeGames.put(gameState.getMatchId(), gameState);
        room.setMatchId(gameState.getMatchId());
        room.setGameState(gameState);
        roomService.setRoomPlaying(room.getRoomId());
        
        gameState.startGame();
        redisService.saveGameState(gameState);
        
        saveMatchToDatabase(room, gameState);
        
        result.put("success", true);
        result.put("message", "游戏开始");
        result.put("gameState", gameState);
        return result;
    }
    
    private GameState initializeGameState(Room room) {
        GameState gameState = new GameState();
        
        List<PlayerInfo> players = room.getPlayerList().stream()
                .filter(p -> p.getStatus() == GameProtocol.PlayerStatus.PLAYER_READY)
                .collect(Collectors.toList());
        
        if (players.size() < 2) return null;
        
        int playerIndex = 0;
        for (PlayerInfo player : players) {
            HeroInstance hero = createHeroInstance(player, playerIndex);
            if (hero != null) {
                gameState.addHero(hero);
            }
            playerIndex++;
        }
        
        return gameState;
    }
    
    private HeroInstance createHeroInstance(PlayerInfo player, int index) {
        HeroInstance hero = new HeroInstance();
        String heroId = player.getSelectedHeroId();
        if (heroId == null || heroId.isEmpty()) {
            heroId = "warrior_001";
        }
        
        hero.setHeroId(heroId);
        hero.setInstanceId("hero_" + player.getUserId() + "_" + UUID.randomUUID().toString().substring(0, 8));
        hero.setPlayerId(player.getUserId());
        hero.setTeamId(player.getTeamId());
        hero.setName(player.getNickname() + "'s " + getHeroName(heroId));
        
        Map<String, Integer> heroStats = getHeroStats(heroId);
        hero.setMaxHealth(heroStats.getOrDefault("health", 100));
        hero.setCurrentHealth(hero.getMaxHealth());
        hero.setMaxMana(heroStats.getOrDefault("mana", 50));
        hero.setCurrentMana(hero.getMaxMana());
        hero.setBaseAttack(heroStats.getOrDefault("attack", 20));
        hero.setBaseDefense(heroStats.getOrDefault("defense", 10));
        hero.setBaseSpeed(heroStats.getOrDefault("speed", 10));
        hero.setMoveRange(heroStats.getOrDefault("moveRange", 2));
        hero.setAttackRange(heroStats.getOrDefault("attackRange", 1));
        
        int x = index % 5;
        int y = player.getTeamId() == 1 ? 1 : 6;
        hero.setPosition(new Position(x, y));
        
        hero.setSkills(createHeroSkills(heroId));
        
        return hero;
    }
    
    private String getHeroName(String heroId) {
        Map<String, String> heroNames = new HashMap<>();
        heroNames.put("warrior_001", "战士");
        heroNames.put("mage_001", "法师");
        heroNames.put("healer_001", "治疗师");
        heroNames.put("archer_001", "弓箭手");
        return heroNames.getOrDefault(heroId, "英雄");
    }
    
    private Map<String, Integer> getHeroStats(String heroId) {
        Map<String, Integer> stats = new HashMap<>();
        switch (heroId) {
            case "warrior_001":
                stats.put("health", 150);
                stats.put("mana", 30);
                stats.put("attack", 25);
                stats.put("defense", 20);
                stats.put("speed", 8);
                stats.put("moveRange", 2);
                stats.put("attackRange", 1);
                break;
            case "mage_001":
                stats.put("health", 80);
                stats.put("mana", 100);
                stats.put("attack", 35);
                stats.put("defense", 5);
                stats.put("speed", 10);
                stats.put("moveRange", 2);
                stats.put("attackRange", 3);
                break;
            case "healer_001":
                stats.put("health", 100);
                stats.put("mana", 80);
                stats.put("attack", 15);
                stats.put("defense", 10);
                stats.put("speed", 9);
                stats.put("moveRange", 3);
                stats.put("attackRange", 2);
                break;
            case "archer_001":
                stats.put("health", 90);
                stats.put("mana", 50);
                stats.put("attack", 30);
                stats.put("defense", 8);
                stats.put("speed", 12);
                stats.put("moveRange", 3);
                stats.put("attackRange", 4);
                break;
            default:
                stats.put("health", 100);
                stats.put("mana", 50);
                stats.put("attack", 20);
                stats.put("defense", 10);
                stats.put("speed", 10);
                stats.put("moveRange", 2);
                stats.put("attackRange", 1);
        }
        return stats;
    }
    
    private Map<String, Skill> createHeroSkills(String heroId) {
        Map<String, Skill> skills = new HashMap<>();
        
        switch (heroId) {
            case "warrior_001":
                skills.put("slash", createSkill("slash", "猛击", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 35, 0, 2, 1, 0, 5, 10));
                skills.put("shield_bash", createSkill("shield_bash", "盾击", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 20, 0, 3, 1, 0, 4, 15,
                        GameProtocol.EffectCategory.EFFECT_STUN, GameProtocol.EffectType.EFFECT_CONTROL, 1, 50));
                break;
                
            case "mage_001":
                skills.put("fireball", createSkill("fireball", "火球术", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_MAGICAL, 50, 0, 3, 3, 0, 6, 20,
                        GameProtocol.EffectCategory.EFFECT_BURN, GameProtocol.EffectType.EFFECT_DEBUFF, 2, 10));
                skills.put("ice_storm", createSkill("ice_storm", "冰风暴", GameProtocol.TargetType.TARGET_AREA,
                        GameProtocol.DamageType.DAMAGE_MAGICAL, 35, 0, 4, 3, 2, 4, 30));
                break;
                
            case "healer_001":
                skills.put("heal", createSkill("heal", "治疗术", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 0, 40, 2, 3, 0, 3, 15));
                skills.put("blessing", createSkill("blessing", "祝福", GameProtocol.TargetType.TARGET_TEAM,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 0, 20, 5, 0, 0, 2, 25,
                        GameProtocol.EffectCategory.EFFECT_ATK_UP, GameProtocol.EffectType.EFFECT_BUFF, 2, 10));
                break;
                
            case "archer_001":
                skills.put("piercing_shot", createSkill("piercing_shot", "穿透射击", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 40, 0, 3, 4, 0, 5, 12));
                skills.put("poison_arrow", createSkill("poison_arrow", "毒箭", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 20, 0, 3, 4, 0, 4, 15,
                        GameProtocol.EffectCategory.EFFECT_POISON, GameProtocol.EffectType.EFFECT_DEBUFF, 3, 15));
                break;
                
            default:
                skills.put("basic_attack", createSkill("basic_attack", "基础攻击", GameProtocol.TargetType.TARGET_SINGLE,
                        GameProtocol.DamageType.DAMAGE_PHYSICAL, 25, 0, 1, 1, 0, 5, 0));
        }
        
        return skills;
    }
    
    private Skill createSkill(String id, String name, GameProtocol.TargetType targetType,
                              GameProtocol.DamageType damageType, int damage, int healing, int cooldown,
                              int range, int aoeRadius, int priority, int manaCost) {
        Skill skill = new Skill();
        skill.setSkillId(id);
        skill.setName(name);
        skill.setTargetType(targetType);
        skill.setDamageType(damageType);
        skill.setDamage(damage);
        skill.setHealing(healing);
        skill.setCooldown(cooldown);
        skill.setRange(range);
        skill.setAoeRadius(aoeRadius);
        skill.setPriority(priority);
        skill.setManaCost(manaCost);
        return skill;
    }
    
    private Skill createSkill(String id, String name, GameProtocol.TargetType targetType,
                              GameProtocol.DamageType damageType, int damage, int healing, int cooldown,
                              int range, int aoeRadius, int priority, int manaCost,
                              GameProtocol.EffectCategory effectCategory, GameProtocol.EffectType effectType,
                              int duration, int value) {
        Skill skill = createSkill(id, name, targetType, damageType, damage, healing, cooldown,
                                  range, aoeRadius, priority, manaCost);
        List<StatusEffectTemplate> effects = new ArrayList<>();
        StatusEffectTemplate template = new StatusEffectTemplate();
        template.setEffectId(id + "_effect");
        template.setName("技能效果");
        template.setEffectType(effectType);
        template.setCategory(effectCategory);
        template.setDuration(duration);
        template.setValue(value);
        effects.add(template);
        skill.setStatusEffects(effects);
        return skill;
    }
    
    public ActionResult handleAction(Long playerId, GameProtocol.ActionRequest request) {
        String roomId = roomService.getRoomIdByPlayer(playerId);
        if (roomId == null) {
            return ActionResult.fail("您不在游戏中");
        }
        
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getGameState() == null) {
            return ActionResult.fail("游戏不存在");
        }
        
        GameState gameState = room.getGameState();
        String matchId = gameState.getMatchId();
        
        ReentrantLock lock = getGameLock(matchId);
        lock.lock();
        try {
            if (gameState.isGameOver()) {
                return ActionResult.fail("游戏已结束");
            }
            
            if (gameState.getCurrentPlayerId() != playerId) {
                return ActionResult.fail("不是您的回合");
            }
            
            HeroInstance currentHero = gameState.getHeroByPlayerId(playerId);
            if (currentHero == null) {
                return ActionResult.fail("您的英雄不存在");
            }
            
            ActionResult result;
            switch (request.getActionType()) {
                case ACTION_MOVE:
                    Position targetPos = Position.fromProto(request.getTargetPosition());
                    if (!gameState.moveHero(currentHero.getInstanceId(), targetPos)) {
                        result = ActionResult.fail("无法移动到目标位置");
                    } else {
                        result = ActionResult.success(GameProtocol.ActionType.ACTION_MOVE, 
                                                       currentHero, null, 0, 0, null);
                    }
                    break;
                    
                case ACTION_ATTACK:
                    HeroInstance target = gameState.getHeroByPlayerId(request.getTargetPlayerId());
                    if (target == null) {
                        return ActionResult.fail("目标不存在");
                    }
                    result = gameState.basicAttack(currentHero.getInstanceId(), target.getInstanceId());
                    break;
                    
                case ACTION_SKILL:
                    String skillId = request.getSkillId();
                    HeroInstance skillTarget = null;
                    Position skillTargetPos = null;
                    
                    if (request.hasTargetPosition()) {
                        skillTargetPos = Position.fromProto(request.getTargetPosition());
                    }
                    
                    if (request.getTargetPlayerId() > 0) {
                        skillTarget = gameState.getHeroByPlayerId(request.getTargetPlayerId());
                    }
                    
                    result = gameState.useSkill(currentHero.getInstanceId(), skillId,
                                                 skillTarget != null ? skillTarget.getInstanceId() : null,
                                                 skillTargetPos);
                    break;
                    
                case ACTION_END_TURN:
                    gameState.endPlayerTurn();
                    gameState.nextPlayer();
                    result = ActionResult.success(GameProtocol.ActionType.ACTION_END_TURN,
                                                   currentHero, null, 0, 0, null);
                    result.setMessage("回合结束");
                    break;
                    
                default:
                    result = ActionResult.fail("未知的操作类型");
            }
            
            redisService.saveGameState(gameState);
            
            if (gameState.isGameOver()) {
                endGame(room, gameState);
                gameLocks.remove(matchId);
            } else if (aiService != null) {
                long nextPlayerId = gameState.getCurrentPlayerId();
                if (aiService.isAIPlayer(nextPlayerId)) {
                    aiService.handleAITurn(room.getRoomId(), gameState);
                }
            }
            
            return result;
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
    
    public GameState getGameState(String matchId) {
        GameState gameState = activeGames.get(matchId);
        if (gameState == null) {
            gameState = redisService.getGameState(matchId);
            if (gameState != null) {
                activeGames.put(matchId, gameState);
            }
        }
        return gameState;
    }
    
    public void endGame(Room room, GameState gameState) {
        activeGames.remove(gameState.getMatchId());
        
        List<PlayerInfo> winners = new ArrayList<>();
        List<PlayerInfo> losers = new ArrayList<>();
        
        for (PlayerInfo player : room.getPlayerList()) {
            HeroInstance hero = gameState.getHeroByPlayerId(player.getUserId());
            if (hero != null) {
                if (hero.getTeamId() == gameState.getWinnerTeamId()) {
                    winners.add(player);
                } else {
                    losers.add(player);
                }
            }
        }
        
        for (PlayerInfo winner : winners) {
            int ratingChange = calculateRatingChange(gameState, true);
            userService.updateRating(winner.getUserId(), ratingChange);
            userService.addMatchStats(winner.getUserId(), true);
            updateMatchPlayer(gameState.getMatchId(), winner.getUserId(), true, 
                              ratingChange, gameState);
        }
        
        for (PlayerInfo loser : losers) {
            int ratingChange = calculateRatingChange(gameState, false);
            userService.updateRating(loser.getUserId(), ratingChange);
            userService.addMatchStats(loser.getUserId(), false);
            updateMatchPlayer(gameState.getMatchId(), loser.getUserId(), false,
                              ratingChange, gameState);
        }
        
        replayService.saveReplay(room, gameState);
        
        updateMatchRecord(gameState);
        
        roomService.setRoomEnded(room.getRoomId());
    }
    
    private int calculateRatingChange(GameState gameState, boolean won) {
        int baseChange = won ? 15 : -10;
        int turnBonus = Math.min(gameState.getCurrentTurn(), 20);
        return won ? baseChange + turnBonus / 2 : baseChange;
    }
    
    private void saveMatchToDatabase(Room room, GameState gameState) {
        GameMatch match = new GameMatch();
        match.setMatchId(gameState.getMatchId());
        match.setRoomId(room.getRoomId());
        match.setGameMode("NORMAL");
        match.setStatus(0);
        match.setStartTime(LocalDateTime.now());
        gameMatchMapper.insert(match);
        
        for (PlayerInfo player : room.getPlayerList()) {
            MatchPlayer mp = new MatchPlayer();
            mp.setMatchId(gameState.getMatchId());
            mp.setUserId(player.getUserId());
            mp.setHeroId(player.getSelectedHeroId() != null ? player.getSelectedHeroId() : "warrior_001");
            mp.setTeamId(player.getTeamId());
            mp.setPosition(player.getPosition());
            matchPlayerMapper.insert(mp);
        }
    }
    
    private void updateMatchPlayer(String matchId, Long userId, boolean won, int ratingChange,
                                    GameState gameState) {
        MatchPlayer mp = matchPlayerMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<MatchPlayer>()
                        .eq("match_id", matchId)
                        .eq("user_id", userId));
        
        if (mp != null) {
            mp.setResult(won ? 1 : 0);
            mp.setRatingChange(ratingChange);
            mp.setKills(gameState.getPlayerKills().getOrDefault(userId, 0));
            mp.setDeaths(gameState.getPlayerDeaths().getOrDefault(userId, 0));
            mp.setDamageDealt(gameState.getPlayerDamageDealt().getOrDefault(userId, 0L));
            mp.setHealing(gameState.getPlayerHealing().getOrDefault(userId, 0L));
            matchPlayerMapper.updateById(mp);
            
            updatePlayerStats(userId, mp.getHeroId(), won, mp);
        }
    }
    
    private void updatePlayerStats(Long userId, String heroId, boolean won, MatchPlayer mp) {
        PlayerStats stats = playerStatsMapper.findByUserAndHero(userId, heroId);
        if (stats == null) {
            stats = new PlayerStats();
            stats.setUserId(userId);
            stats.setHeroId(heroId);
            stats.setGamesPlayed(1);
            stats.setGamesWon(won ? 1 : 0);
            stats.setTotalKills(mp.getKills());
            stats.setTotalDeaths(mp.getDeaths());
            stats.setTotalDamageDealt(mp.getDamageDealt());
            stats.setTotalDamageTaken(mp.getDamageTaken() != null ? mp.getDamageTaken() : 0L);
            stats.setTotalHealing(mp.getHealing());
            playerStatsMapper.insert(stats);
        } else {
            stats.setGamesPlayed(stats.getGamesPlayed() + 1);
            if (won) {
                stats.setGamesWon(stats.getGamesWon() + 1);
            }
            stats.setTotalKills(stats.getTotalKills() + mp.getKills());
            stats.setTotalDeaths(stats.getTotalDeaths() + mp.getDeaths());
            stats.setTotalDamageDealt(stats.getTotalDamageDealt() + mp.getDamageDealt());
            stats.setTotalHealing(stats.getTotalHealing() + mp.getHealing());
            playerStatsMapper.updateById(stats);
        }
    }
    
    private void updateMatchRecord(GameState gameState) {
        GameMatch match = gameMatchMapper.findByMatchId(gameState.getMatchId());
        if (match != null) {
            match.setStatus(1);
            match.setEndTime(LocalDateTime.now());
            match.setDurationSeconds((int)(gameState.getActionHistory().size() * 30));
            match.setReplayFilePath(replayService.getReplayFilePath(gameState.getMatchId()));
            
            for (HeroInstance hero : gameState.getHeroes().values()) {
                if (hero.getTeamId() == gameState.getWinnerTeamId()) {
                    match.setWinnerId(hero.getPlayerId());
                    break;
                }
            }
            
            gameMatchMapper.updateById(match);
        }
    }
}
