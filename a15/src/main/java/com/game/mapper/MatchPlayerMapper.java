package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.MatchPlayer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface MatchPlayerMapper extends BaseMapper<MatchPlayer> {
    
    @Select("SELECT * FROM match_players WHERE match_id = #{matchId}")
    List<MatchPlayer> findByMatchId(@Param("matchId") String matchId);
}
