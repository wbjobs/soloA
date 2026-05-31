package com.game.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("match_players")
public class MatchPlayer {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    @TableField("match_id")
    private String matchId;
    
    @TableField("user_id")
    private Long userId;
    
    @TableField("hero_id")
    private String heroId;
    
    @TableField("team_id")
    private Integer teamId = 1;
    
    @TableField("is_ai")
    private Integer isAi = 0;
    
    private Integer position = 0;
    
    private Integer result;
    
    private Integer kills = 0;
    
    private Integer deaths = 0;
    
    private Integer assists = 0;
    
    @TableField("damage_dealt")
    private Long damageDealt = 0L;
    
    @TableField("damage_taken")
    private Long damageTaken = 0L;
    
    private Long healing = 0L;
    
    @TableField("rating_change")
    private Integer ratingChange = 0;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
