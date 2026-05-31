package com.game.model;

import com.game.protocol.GameProtocol;
import lombok.Data;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
public class Position implements Serializable {
    private int x;
    private int y;
    
    public Position() {}
    
    public Position(int x, int y) {
        this.x = x;
        this.y = y;
    }
    
    public static Position fromProto(GameProtocol.Position proto) {
        return new Position(proto.getX(), proto.getY());
    }
    
    public GameProtocol.Position toProto() {
        return GameProtocol.Position.newBuilder()
                .setX(x)
                .setY(y)
                .build();
    }
    
    public double distanceTo(Position other) {
        return Math.sqrt(Math.pow(x - other.x, 2) + Math.pow(y - other.y, 2));
    }
    
    public int manhattanDistance(Position other) {
        return Math.abs(x - other.x) + Math.abs(y - other.y);
    }
}
