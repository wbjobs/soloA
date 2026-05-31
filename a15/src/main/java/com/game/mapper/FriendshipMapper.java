package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.Friendship;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface FriendshipMapper extends BaseMapper<Friendship> {
    
    @Select("SELECT * FROM friendships WHERE user_id = #{userId} AND status = 1")
    List<Friendship> findFriendsByUserId(@Param("userId") Long userId);
    
    @Select("SELECT * FROM friendships WHERE (user_id = #{userId} OR friend_id = #{userId}) AND status = 1")
    List<Friendship> findAllFriendships(@Param("userId") Long userId);
    
    @Select("SELECT * FROM friendships WHERE ((user_id = #{userId} AND friend_id = #{friendId}) OR (user_id = #{friendId} AND friend_id = #{userId}))")
    Friendship findByUserAndFriend(@Param("userId") Long userId, @Param("friendId") Long friendId);
}
