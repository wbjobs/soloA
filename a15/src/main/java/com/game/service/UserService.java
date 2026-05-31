package com.game.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.game.entity.User;
import com.game.mapper.UserMapper;
import com.game.model.PlayerInfo;
import com.game.protocol.GameProtocol;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UserService {
    
    @Autowired
    private UserMapper userMapper;
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${jwt.expiration}")
    private long jwtExpiration;
    
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final Map<Long, String> onlineUsers = new ConcurrentHashMap<>();
    
    public Map<String, Object> register(String username, String password, String email, String nickname) {
        Map<String, Object> result = new HashMap<>();
        
        if (userMapper.findByUsername(username) != null) {
            result.put("success", false);
            result.put("message", "用户名已存在");
            return result;
        }
        
        if (email != null && !email.isEmpty() && userMapper.findByEmail(email) != null) {
            result.put("success", false);
            result.put("message", "邮箱已被注册");
            return result;
        }
        
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setEmail(email);
        user.setNickname(nickname != null ? nickname : username);
        user.setLevel(1);
        user.setExperience(0);
        user.setRating(1500);
        user.setStatus(0);
        
        userMapper.insert(user);
        
        result.put("success", true);
        result.put("message", "注册成功");
        result.put("userId", user.getId());
        return result;
    }
    
    public Map<String, Object> login(String username, String password) {
        Map<String, Object> result = new HashMap<>();
        
        User user = userMapper.findByUsername(username);
        if (user == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }
        
        if (user.getStatus() != 0) {
            result.put("success", false);
            result.put("message", "账号已被封禁");
            return result;
        }
        
        if (!passwordEncoder.matches(password, user.getPassword())) {
            result.put("success", false);
            result.put("message", "密码错误");
            return result;
        }
        
        String token = generateToken(user.getId(), username);
        
        user.setLastLoginAt(java.time.LocalDateTime.now());
        userMapper.updateById(user);
        
        PlayerInfo playerInfo = createPlayerInfo(user);
        onlineUsers.put(user.getId(), token);
        
        result.put("success", true);
        result.put("message", "登录成功");
        result.put("token", token);
        result.put("playerInfo", playerInfo);
        return result;
    }
    
    public void logout(Long userId) {
        onlineUsers.remove(userId);
    }
    
    public boolean isOnline(Long userId) {
        return onlineUsers.containsKey(userId);
    }
    
    public String getTokenByUserId(Long userId) {
        return onlineUsers.get(userId);
    }
    
    public Long validateToken(String token) {
        try {
            Claims claims = Jwts.parser()
                    .setSigningKey(jwtSecret)
                    .parseClaimsJws(token)
                    .getBody();
            Long userId = claims.get("userId", Long.class);
            if (userId != null && onlineUsers.containsKey(userId)) {
                return userId;
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }
    
    public PlayerInfo getPlayerInfo(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) return null;
        return createPlayerInfo(user);
    }
    
    public PlayerInfo createPlayerInfo(User user) {
        PlayerInfo info = new PlayerInfo();
        info.setUserId(user.getId());
        info.setUsername(user.getUsername());
        info.setNickname(user.getNickname());
        info.setAvatar(user.getAvatar());
        info.setLevel(user.getLevel());
        info.setRating(user.getRating());
        info.setStatus(onlineUsers.containsKey(user.getId()) ? 
                       GameProtocol.PlayerStatus.PLAYER_ONLINE : 
                       GameProtocol.PlayerStatus.PLAYER_OFFLINE);
        return info;
    }
    
    public void updateRating(Long userId, int change) {
        User user = userMapper.selectById(userId);
        if (user != null) {
            user.setRating(Math.max(0, user.getRating() + change));
            userMapper.updateById(user);
        }
    }
    
    public void addMatchStats(Long userId, boolean won) {
        User user = userMapper.selectById(userId);
        if (user != null) {
            user.setMatchesPlayed(user.getMatchesPlayed() + 1);
            if (won) {
                user.setMatchesWon(user.getMatchesWon() + 1);
                int expGain = 100;
                user.setExperience(user.getExperience() + expGain);
                
                int expForNextLevel = user.getLevel() * 200;
                if (user.getExperience() >= expForNextLevel) {
                    user.setLevel(user.getLevel() + 1);
                    user.setExperience(user.getExperience() - expForNextLevel);
                }
            } else {
                user.setMatchesLost(user.getMatchesLost() + 1);
                user.setExperience(user.getExperience() + 20);
            }
            userMapper.updateById(user);
        }
    }
    
    private String generateToken(Long userId, String username) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpiration);
        
        return Jwts.builder()
                .setSubject(Long.toString(userId))
                .claim("userId", userId)
                .claim("username", username)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(SignatureAlgorithm.HS512, jwtSecret)
                .compact();
    }
}
