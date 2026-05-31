package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.GameInviteEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface GameInviteMapper extends BaseMapper<GameInviteEntity> {
    
    @Select("SELECT * FROM game_invites WHERE invite_id = #{inviteId}")
    GameInviteEntity findByInviteId(@Param("inviteId") String inviteId);
    
    @Select("SELECT * FROM game_invites WHERE invitee_id = #{inviteeId} AND status = 0 ORDER BY created_at DESC")
    List<GameInviteEntity> findPendingByInvitee(@Param("inviteeId") Long inviteeId);
}
