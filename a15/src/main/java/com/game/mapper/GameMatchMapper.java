package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.GameMatch;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface GameMatchMapper extends BaseMapper<GameMatch> {
    
    @Select("SELECT * FROM game_matches WHERE match_id = #{matchId}")
    GameMatch findByMatchId(@Param("matchId") String matchId);
}
