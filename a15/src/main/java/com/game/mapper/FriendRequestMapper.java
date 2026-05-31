package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.FriendRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface FriendRequestMapper extends BaseMapper<FriendRequest> {
    
    @Select("SELECT * FROM friend_requests WHERE to_user_id = #{userId} AND status = 0 ORDER BY created_at DESC")
    List<FriendRequest> findPendingByToUser(@Param("userId") Long userId);
    
    @Select("SELECT * FROM friend_requests WHERE from_user_id = #{userId} AND status = 0 ORDER BY created_at DESC")
    List<FriendRequest> findPendingByFromUser(@Param("userId") Long userId);
    
    @Select("SELECT * FROM friend_requests WHERE from_user_id = #{fromUserId} AND to_user_id = #{toUserId} AND status = 0")
    FriendRequest findPendingBetweenUsers(@Param("fromUserId") Long fromUserId, @Param("toUserId") Long toUserId);
}
