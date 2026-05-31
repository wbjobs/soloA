package com.game.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("player_stats")
public class PlayerStats {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    @TableField("user_id")
    private Long userId;
    
    @TableField("hero_id")
    private String heroId;
    
    @TableField("games_played")
    private Integer gamesPlayed = 0;
    
    @TableField("games_won")
    private Integer gamesWon = 0;
    
    @TableField("total_kills")
    private Integer totalKills = 0;
    
    @TableField("total_deaths")
    private Integer totalDeaths = 0;
    
    @TableField("total_assists")
    private Integer totalAssists = 0;
    
    @TableField("total_damage_dealt")
    private Long totalDamageDealt = 0L;
    
    @TableField("total_damage_taken")
    private Long totalDamageTaken = 0L;
    
    @TableField("total_healing")
    private Long totalHealing = 0L;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
