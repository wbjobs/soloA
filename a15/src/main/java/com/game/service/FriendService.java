package com.game.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.game.entity.FriendRequest;
import com.game.entity.Friendship;
import com.game.entity.User;
import com.game.mapper.FriendRequestMapper;
import com.game.mapper.FriendshipMapper;
import com.game.mapper.UserMapper;
import com.game.model.PlayerInfo;
import com.game.protocol.GameProtocol;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
public class FriendService {
    
    @Autowired
    private UserMapper userMapper;
    
    @Autowired
    private FriendshipMapper friendshipMapper;
    
    @Autowired
    private FriendRequestMapper friendRequestMapper;
    
    @Autowired
    private UserService userService;
    
    @Transactional
    public Map<String, Object> sendFriendRequest(Long fromUserId, String targetUsername, String message) {
        Map<String, Object> result = new HashMap<>();
        
        if (fromUserId == null || targetUsername == null || targetUsername.trim().isEmpty()) {
            result.put("success", false);
            result.put("message", "参数无效");
            return result;
        }
        
        User targetUser = userMapper.findByUsername(targetUsername.trim());
        if (targetUser == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }
        
        if (targetUser.getId().equals(fromUserId)) {
            result.put("success", false);
            result.put("message", "不能添加自己为好友");
            return result;
        }
        
        Friendship existingFriendship = friendshipMapper.findByUserAndFriend(fromUserId, targetUser.getId());
        if (existingFriendship != null && existingFriendship.getStatus() == 1) {
            result.put("success", false);
            result.put("message", "已经是好友了");
            return result;
        }
        
        FriendRequest existingRequest = friendRequestMapper.findPendingBetweenUsers(fromUserId, targetUser.getId());
        if (existingRequest != null) {
            result.put("success", false);
            result.put("message", "已有待处理的好友请求");
            return result;
        }
        
        FriendRequest pendingFromTarget = friendRequestMapper.findPendingBetweenUsers(targetUser.getId(), fromUserId);
        if (pendingFromTarget != null) {
            return acceptFriendRequest(targetUser.getId(), fromUserId, true);
        }
        
        FriendRequest request = new FriendRequest();
        request.setFromUserId(fromUserId);
        request.setToUserId(targetUser.getId());
        request.setMessage(message != null ? message : "");
        request.setStatus(0);
        friendRequestMapper.insert(request);
        
        result.put("success", true);
        result.put("message", "好友请求已发送");
        result.put("friend", createFriendInfo(targetUser, GameProtocol.FriendStatus.FRIEND_PENDING));
        return result;
    }
    
    @Transactional
    public Map<String, Object> acceptFriendRequest(Long toUserId, Long fromUserId, boolean accept) {
        Map<String, Object> result = new HashMap<>();
        
        FriendRequest request = friendRequestMapper.findPendingBetweenUsers(fromUserId, toUserId);
        if (request == null) {
            result.put("success", false);
            result.put("message", "好友请求不存在");
            return result;
        }
        
        if (accept) {
            request.setStatus(1);
            friendRequestMapper.updateById(request);
            
            Friendship friendship1 = new Friendship();
            friendship1.setUserId(fromUserId);
            friendship1.setFriendId(toUserId);
            friendship1.setStatus(1);
            friendshipMapper.insert(friendship1);
            
            Friendship friendship2 = new Friendship();
            friendship2.setUserId(toUserId);
            friendship2.setFriendId(fromUserId);
            friendship2.setStatus(1);
            friendshipMapper.insert(friendship2);
            
            result.put("success", true);
            result.put("message", "已接受好友请求");
        } else {
            request.setStatus(2);
            friendRequestMapper.updateById(request);
            
            result.put("success", true);
            result.put("message", "已拒绝好友请求");
        }
        
        return result;
    }
    
    @Transactional
    public Map<String, Object> removeFriend(Long userId, Long friendId) {
        Map<String, Object> result = new HashMap<>();
        
        QueryWrapper<Friendship> wrapper = new QueryWrapper<>();
        wrapper.and(w -> w.eq("user_id", userId).eq("friend_id", friendId))
               .or(w -> w.eq("user_id", friendId).eq("friend_id", userId));
        
        List<Friendship> friendships = friendshipMapper.selectList(wrapper);
        for (Friendship friendship : friendships) {
            friendship.setStatus(3);
            friendshipMapper.updateById(friendship);
        }
        
        result.put("success", true);
        result.put("message", "已删除好友");
        return result;
    }
    
    public List<Map<String, Object>> getFriendList(Long userId) {
        List<Map<String, Object>> result = new ArrayList<>();
        
        List<Friendship> friendships = friendshipMapper.findFriendsByUserId(userId);
        for (Friendship friendship : friendships) {
            Long friendId = friendship.getFriendId();
            PlayerInfo friendInfo = userService.getPlayerInfo(friendId);
            if (friendInfo != null) {
                Map<String, Object> friendMap = new HashMap<>();
                friendMap.put("userId", friendId);
                friendMap.put("friend", createFriendInfo(userMapper.selectById(friendId), 
                                                          GameProtocol.FriendStatus.FRIEND_ACCEPTED));
                friendMap.put("alias", friendship.getAlias());
                result.add(friendMap);
            }
        }
        
        return result;
    }
    
    public Map<String, Object> getFriendRequests(Long userId) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> pendingRequests = new ArrayList<>();
        List<Map<String, Object>> sentRequests = new ArrayList<>();
        
        List<FriendRequest> pending = friendRequestMapper.findPendingByToUser(userId);
        for (FriendRequest request : pending) {
            Map<String, Object> reqMap = new HashMap<>();
            reqMap.put("requestId", request.getId());
            reqMap.put("fromUser", userService.getPlayerInfo(request.getFromUserId()));
            reqMap.put("message", request.getMessage());
            reqMap.put("status", request.getStatus());
            reqMap.put("createdAt", request.getCreatedAt());
            pendingRequests.add(reqMap);
        }
        
        List<FriendRequest> sent = friendRequestMapper.findPendingByFromUser(userId);
        for (FriendRequest request : sent) {
            Map<String, Object> reqMap = new HashMap<>();
            reqMap.put("requestId", request.getId());
            reqMap.put("toUser", userService.getPlayerInfo(request.getToUserId()));
            reqMap.put("message", request.getMessage());
            reqMap.put("status", request.getStatus());
            reqMap.put("createdAt", request.getCreatedAt());
            sentRequests.add(reqMap);
        }
        
        result.put("success", true);
        result.put("pendingRequests", pendingRequests);
        result.put("sentRequests", sentRequests);
        return result;
    }
    
    public boolean areFriends(Long userId1, Long userId2) {
        if (userId1 == null || userId2 == null) return false;
        if (userId1.equals(userId2)) return true;
        
        Friendship friendship = friendshipMapper.findByUserAndFriend(userId1, userId2);
        return friendship != null && friendship.getStatus() == 1;
    }
    
    private Map<String, Object> createFriendInfo(User user, GameProtocol.FriendStatus status) {
        Map<String, Object> info = new HashMap<>();
        info.put("userId", user.getId());
        info.put("username", user.getUsername());
        info.put("nickname", user.getNickname());
        info.put("avatar", user.getAvatar());
        info.put("level", user.getLevel());
        info.put("rating", user.getRating());
        info.put("status", userService.isOnline(user.getId()) ? 
                  GameProtocol.PlayerStatus.PLAYER_ONLINE : 
                  GameProtocol.PlayerStatus.PLAYER_OFFLINE);
        info.put("friendStatus", status);
        return info;
    }
}
