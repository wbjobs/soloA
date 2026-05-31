package com.game.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("heroes")
public class Hero {
    @TableId(type = IdType.INPUT)
    private String id;
    
    private String name;
    
    private String description;
    
    private String avatar;
    
    @TableField("base_health")
    private Integer baseHealth;
    
    @TableField("base_attack")
    private Integer baseAttack;
    
    @TableField("base_defense")
    private Integer baseDefense;
    
    @TableField("base_speed")
    private Integer baseSpeed;
    
    @TableField("move_range")
    private Integer moveRange = 2;
    
    @TableField("attack_range")
    private Integer attackRange = 1;
    
    @TableField("skill_set")
    private String skillSet;
    
    @TableField("passive_skill")
    private String passiveSkill;
    
    @TableField("is_active")
    private Integer isActive = 1;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
