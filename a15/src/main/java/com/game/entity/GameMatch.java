package com.game.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("game_matches")
public class GameMatch {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    @TableField("match_id")
    private String matchId;
    
    @TableField("room_id")
    private String roomId;
    
    @TableField("game_mode")
    private String gameMode = "NORMAL";
    
    private Integer status = 0;
    
    @TableField("start_time")
    private LocalDateTime startTime;
    
    @TableField("end_time")
    private LocalDateTime endTime;
    
    @TableField("duration_seconds")
    private Integer durationSeconds;
    
    @TableField("winner_id")
    private Long winnerId;
    
    @TableField("replay_file_path")
    private String replayFilePath;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
