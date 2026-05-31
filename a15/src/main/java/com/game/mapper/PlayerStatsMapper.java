package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.PlayerStats;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface PlayerStatsMapper extends BaseMapper<PlayerStats> {
    
    @Select("SELECT * FROM player_stats WHERE user_id = #{userId} AND hero_id = #{heroId}")
    PlayerStats findByUserAndHero(@Param("userId") Long userId, @Param("heroId") String heroId);
}
