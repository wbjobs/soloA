package com.game.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("game_invites")
public class GameInviteEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    @TableField("invite_id")
    private String inviteId;
    
    @TableField("room_id")
    private String roomId;
    
    @TableField("inviter_id")
    private Long inviterId;
    
    @TableField("invitee_id")
    private Long inviteeId;
    
    private Integer status = 0;
    
    @TableField("ai_difficulty")
    private Integer aiDifficulty = 0;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    
    @TableField("expires_at")
    private LocalDateTime expiresAt;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
