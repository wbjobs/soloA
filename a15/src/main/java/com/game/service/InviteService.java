package com.game.service;

import com.game.entity.GameInviteEntity;
import com.game.mapper.GameInviteMapper;
import com.game.model.PlayerInfo;
import com.game.model.Room;
import com.game.protocol.GameProtocol;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
public class InviteService {
    
    @Autowired
    private GameInviteMapper gameInviteMapper;
    
    @Autowired
    private FriendService friendService;
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private RoomService roomService;
    
    private static final int INVITE_EXPIRE_MINUTES = 5;
    
    @Transactional
    public Map<String, Object> sendGameInvite(Long inviterId, Long inviteeId, String roomId, String message) {
        Map<String, Object> result = new HashMap<>();
        
        if (!friendService.areFriends(inviterId, inviteeId)) {
            result.put("success", false);
            result.put("message", "只能邀请好友对战");
            return result;
        }
        
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            result.put("success", false);
            result.put("message", "房间不存在");
            return result;
        }
        
        if (room.getOwnerId() != inviterId) {
            result.put("success", false);
            result.put("message", "只有房主可以邀请");
            return result;
        }
        
        if (room.isFull()) {
            result.put("success", false);
            result.put("message", "房间已满");
            return result;
        }
        
        String inviteId = UUID.randomUUID().toString().replace("-", "");
        
        GameInviteEntity invite = new GameInviteEntity();
        invite.setInviteId(inviteId);
        invite.setRoomId(roomId);
        invite.setInviterId(inviterId);
        invite.setInviteeId(inviteeId);
        invite.setStatus(0);
        invite.setExpiresAt(LocalDateTime.now().plusMinutes(INVITE_EXPIRE_MINUTES));
        gameInviteMapper.insert(invite);
        
        result.put("success", true);
        result.put("message", "邀请已发送");
        result.put("inviteId", inviteId);
        result.put("invitee", userService.getPlayerInfo(inviteeId));
        result.put("expiresAt", invite.getExpiresAt());
        return result;
    }
    
    @Transactional
    public Map<String, Object> acceptInvite(Long inviteeId, String inviteId) {
        Map<String, Object> result = new HashMap<>();
        
        GameInviteEntity invite = gameInviteMapper.findByInviteId(inviteId);
        if (invite == null) {
            result.put("success", false);
            result.put("message", "邀请不存在");
            return result;
        }
        
        if (!invite.getInviteeId().equals(inviteeId)) {
            result.put("success", false);
            result.put("message", "无权限处理此邀请");
            return result;
        }
        
        if (invite.getStatus() != 0) {
            result.put("success", false);
            result.put("message", "邀请已处理");
            return result;
        }
        
        if (invite.getExpiresAt().isBefore(LocalDateTime.now())) {
            invite.setStatus(3);
            gameInviteMapper.updateById(invite);
            result.put("success", false);
            result.put("message", "邀请已过期");
            return result;
        }
        
        Room room = roomService.getRoom(invite.getRoomId());
        if (room == null || room.isFull()) {
            result.put("success", false);
            result.put("message", "房间不存在或已满");
            return result;
        }
        
        invite.setStatus(1);
        gameInviteMapper.updateById(invite);
        
        Map<String, Object> joinResult = roomService.joinRoom(inviteeId, invite.getRoomId(), null);
        if (!(Boolean) joinResult.get("success")) {
            result.put("success", false);
            result.put("message", (String) joinResult.get("message"));
            return result;
        }
        
        result.put("success", true);
        result.put("message", "已接受邀请");
        result.put("room", joinResult.get("room"));
        return result;
    }
    
    @Transactional
    public Map<String, Object> declineInvite(Long inviteeId, String inviteId) {
        Map<String, Object> result = new HashMap<>();
        
        GameInviteEntity invite = gameInviteMapper.findByInviteId(inviteId);
        if (invite == null) {
            result.put("success", false);
            result.put("message", "邀请不存在");
            return result;
        }
        
        if (!invite.getInviteeId().equals(inviteeId)) {
            result.put("success", false);
            result.put("message", "无权限处理此邀请");
            return result;
        }
        
        if (invite.getStatus() != 0) {
            result.put("success", false);
            result.put("message", "邀请已处理");
            return result;
        }
        
        invite.setStatus(2);
        gameInviteMapper.updateById(invite);
        
        result.put("success", true);
        result.put("message", "已拒绝邀请");
        return result;
    }
    
    public List<Map<String, Object>> getPendingInvites(Long inviteeId) {
        List<Map<String, Object>> result = new ArrayList<>();
        
        List<GameInviteEntity> invites = gameInviteMapper.findPendingByInvitee(inviteeId);
        for (GameInviteEntity invite : invites) {
            if (invite.getExpiresAt().isBefore(LocalDateTime.now())) {
                continue;
            }
            
            Map<String, Object> inviteMap = new HashMap<>();
            inviteMap.put("inviteId", invite.getInviteId());
            inviteMap.put("roomId", invite.getRoomId());
            
            PlayerInfo inviter = userService.getPlayerInfo(invite.getInviterId());
            if (inviter != null) {
                inviteMap.put("inviter", inviter);
            }
            
            inviteMap.put("expiresAt", invite.getExpiresAt());
            inviteMap.put("createdAt", invite.getCreatedAt());
            result.add(inviteMap);
        }
        
        return result;
    }
}
