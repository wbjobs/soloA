package com.game.netty;

import com.game.protocol.GameProtocol;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageDecoder;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

@Slf4j
public class ProtobufWebSocketFrameHandler extends MessageToMessageDecoder<WebSocketFrame> {
    
    @Override
    protected void decode(ChannelHandlerContext ctx, WebSocketFrame frame, List<Object> out) throws Exception {
        if (frame instanceof BinaryWebSocketFrame) {
            ByteBuf content = frame.content();
            if (content != null && content.readableBytes() > 0) {
                try {
                    byte[] bytes = new byte[content.readableBytes()];
                    content.readBytes(bytes);
                    
                    GameProtocol.GameMessage message = GameProtocol.GameMessage.parseFrom(bytes);
                    out.add(message);
                    
                } catch (Exception e) {
                    log.error("Failed to parse protobuf message", e);
                }
            }
        }
    }
}
