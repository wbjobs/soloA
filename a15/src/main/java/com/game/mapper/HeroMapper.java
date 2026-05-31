package com.game.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.game.entity.Hero;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface HeroMapper extends BaseMapper<Hero> {
}
