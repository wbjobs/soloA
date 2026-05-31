package com.game.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.game.entity.User;
import com.game.mapper.UserMapper;
import com.game.model.PlayerInfo;
import com.game.protocol.GameProtocol;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
public class LeaderboardService {
    
    @Autowired
    private UserMapper userMapper;
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final String RATING_KEY = "leaderboard:rating";
    private static final String LEVEL_KEY = "leaderboard:level";
    private static final String WINS_KEY = "leaderboard:wins";
    private static final long CACHE_TTL = 30;
    
    @PostConstruct
    public void init() {
        refreshLeaderboard();
    }
    
    @Scheduled(fixedRate = 60000)
    public void refreshLeaderboard() {
        try {
            refreshRatingLeaderboard();
            refreshLevelLeaderboard();
            refreshWinsLeaderboard();
            log.debug("Leaderboard refreshed");
        } catch (Exception e) {
            log.error("Failed to refresh leaderboard", e);
        }
    }
    
    private void refreshRatingLeaderboard() {
        QueryWrapper<User> wrapper = new QueryWrapper<>();
        wrapper.select("id", "username", "nickname", "avatar", "level", "rating")
                .eq("status", 0)
                .eq("deleted", 0)
                .orderByDesc("rating")
                .last("LIMIT 1000");
        
        List<User> users = userMapper.selectList(wrapper);
        Map<String, Double> scores = new HashMap<>();
        
        for (int i = 0; i < users.size(); i++) {
            User user = users.get(i);
            scores.put(String.valueOf(user.getId()), (double) user.getRating());
        }
        
        redisTemplate.opsForZSet().add(RATING_KEY, scores);
        redisTemplate.expire(RATING_KEY, CACHE_TTL, TimeUnit.MINUTES);
    }
    
    private void refreshLevelLeaderboard() {
        QueryWrapper<User> wrapper = new QueryWrapper<>();
        wrapper.select("id", "username", "nickname", "avatar", "level", "rating")
                .eq("status", 0)
                .eq("deleted", 0)
                .orderByDesc("level", "experience")
                .last("LIMIT 1000");
        
        List<User> users = userMapper.selectList(wrapper);
        Map<String, Double> scores = new HashMap<>();
        
        for (User user : users) {
            int levelScore = user.getLevel() * 1000000 + (user.getExperience() != null ? user.getExperience() : 0);
            scores.put(String.valueOf(user.getId()), (double) levelScore);
        }
        
        redisTemplate.opsForZSet().add(LEVEL_KEY, scores);
        redisTemplate.expire(LEVEL_KEY, CACHE_TTL, TimeUnit.MINUTES);
    }
    
    private void refreshWinsLeaderboard() {
        QueryWrapper<User> wrapper = new QueryWrapper<>();
        wrapper.select("id", "username", "nickname", "avatar", "level", "rating", "matches_won")
                .eq("status", 0)
                .eq("deleted", 0)
                .orderByDesc("matches_won")
                .last("LIMIT 1000");
        
        List<User> users = userMapper.selectList(wrapper);
        Map<String, Double> scores = new HashMap<>();
        
        for (User user : users) {
            scores.put(String.valueOf(user.getId()), (double) (user.getMatchesWon() != null ? user.getMatchesWon() : 0));
        }
        
        redisTemplate.opsForZSet().add(WINS_KEY, scores);
        redisTemplate.expire(WINS_KEY, CACHE_TTL, TimeUnit.MINUTES);
    }
    
    public Map<String, Object> getLeaderboard(GameProtocol.LeaderboardType type, int page, int pageSize, Long currentUserId) {
        Map<String, Object> result = new HashMap<>();
        String key = getRedisKey(type);
        
        long total = redisTemplate.opsForZSet().zCard(key);
        if (total == null || total == 0) {
            refreshLeaderboard();
            total = redisTemplate.opsForZSet().zCard(key);
        }
        
        if (total == null) total = 0;
        
        int start = (page - 1) * pageSize;
        int end = start + pageSize - 1;
        
        Set<Object> userIds = redisTemplate.opsForZSet().reverseRange(key, start, end);
        List<Map<String, Object>> entries = new ArrayList<>();
        
        if (userIds != null && !userIds.isEmpty()) {
            for (Object obj : userIds) {
                try {
                    Long userId = Long.parseLong(obj.toString());
                    PlayerInfo playerInfo = userService.getPlayerInfo(userId);
                    if (playerInfo != null) {
                        Map<String, Object> entry = new HashMap<>();
                        int rank = getRank(type, userId);
                        entry.put("rank", rank);
                        entry.put("player", playerInfo);
                        entry.put("value", getValue(type, playerInfo));
                        entries.add(entry);
                    }
                } catch (Exception e) {
                    log.warn("Invalid user id in leaderboard: {}", obj);
                }
            }
        }
        
        result.put("success", true);
        result.put("total", total);
        result.put("entries", entries);
        result.put("type", type);
        
        if (currentUserId != null) {
            result.put("playerRank", getRank(type, currentUserId));
        }
        
        return result;
    }
    
    public int getRank(GameProtocol.LeaderboardType type, Long userId) {
        String key = getRedisKey(type);
        Long rank = redisTemplate.opsForZSet().reverseRank(key, String.valueOf(userId));
        return rank != null ? rank.intValue() + 1 : 0;
    }
    
    private int getValue(GameProtocol.LeaderboardType type, PlayerInfo playerInfo) {
        switch (type) {
            case LEADERBOARD_RATING:
                return playerInfo.getRating();
            case LEADERBOARD_LEVEL:
                return playerInfo.getLevel();
            case LEADERBOARD_WINS:
                User user = userMapper.selectById(playerInfo.getUserId());
                return user != null && user.getMatchesWon() != null ? user.getMatchesWon() : 0;
            default:
                return 0;
        }
    }
    
    private String getRedisKey(GameProtocol.LeaderboardType type) {
        switch (type) {
            case LEADERBOARD_RATING:
                return RATING_KEY;
            case LEADERBOARD_LEVEL:
                return LEVEL_KEY;
            case LEADERBOARD_WINS:
                return WINS_KEY;
            default:
                return RATING_KEY;
        }
    }
    
    public void updateUserScore(Long userId, int ratingDelta) {
        User user = userMapper.selectById(userId);
        if (user == null) return;
        
        redisTemplate.opsForZSet().add(RATING_KEY, String.valueOf(userId), (double) user.getRating());
        
        if (ratingDelta > 0) {
            int levelScore = user.getLevel() * 1000000 + (user.getExperience() != null ? user.getExperience() : 0);
            redisTemplate.opsForZSet().add(LEVEL_KEY, String.valueOf(userId), (double) levelScore);
        }
    }
}
