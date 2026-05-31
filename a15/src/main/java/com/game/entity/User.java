package com.game.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("users")
public class User {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String username;
    
    private String password;
    
    private String email;
    
    private String nickname;
    
    private String avatar;
    
    private Integer level = 1;
    
    private Integer experience = 0;
    
    private Integer rating = 1500;
    
    @TableField("matches_played")
    private Integer matchesPlayed = 0;
    
    @TableField("matches_won")
    private Integer matchesWon = 0;
    
    @TableField("matches_lost")
    private Integer matchesLost = 0;
    
    private Integer status = 0;
    
    @TableField("last_login_at")
    private LocalDateTime lastLoginAt;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
    
    @TableLogic
    private Integer deleted = 0;
}
