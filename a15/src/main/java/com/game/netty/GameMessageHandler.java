package com.game.netty;

import com.game.ai.AIService;
import com.game.model.PlayerInfo;
import com.game.model.Room;
import com.game.model.GameState;
import com.game.protocol.GameProtocol;
import com.game.service.*;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.timeout.IdleState;
import io.netty.handler.timeout.IdleStateEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@io.netty.channel.ChannelHandler.Sharable
public class GameMessageHandler extends SimpleChannelInboundHandler<GameProtocol.GameMessage> {
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private RoomService roomService;
    
    @Autowired
    private GameService gameService;
    
    @Autowired
    private ReplayService replayService;
    
    @Autowired
    private RedisService redisService;
    
    @Autowired
    private MessageExecutorService executorService;
    
    @Autowired
    private LeaderboardService leaderboardService;
    
    @Autowired
    private FriendService friendService;
    
    @Autowired
    private InviteService inviteService;
    
    @Autowired
    private AIService aiService;
    
    private final Map<String, Channel> playerChannels = new ConcurrentHashMap<>();
    private final Map<Channel, Long> channelPlayers = new ConcurrentHashMap<>();
    private final Map<Channel, String> channelTokens = new ConcurrentHashMap<>();
    
    private static final Set<GameProtocol.MessageType> FAST_MESSAGE_TYPES = EnumSet.of(
            GameProtocol.MessageType.MSG_HEARTBEAT_REQ,
            GameProtocol.MessageType.MSG_LOGIN_REQ,
            GameProtocol.MessageType.MSG_LOGOUT_REQ,
            GameProtocol.MessageType.MSG_REGISTER_REQ,
            GameProtocol.MessageType.MSG_RECONNECT_REQ
    );
    
    @Override
    protected void channelRead0(ChannelHandlerContext ctx, GameProtocol.GameMessage message) throws Exception {
        int sequence = message.getSequence();
        GameProtocol.MessageType type = message.getType();
        Long senderId = message.getSenderId() > 0 ? message.getSenderId() : null;
        
        log.debug("Received message: type={}, senderId={}", type, senderId);
        
        if (senderId != null) {
            String token = channelTokens.get(ctx.channel());
            if (token != null) {
                Long validatedId = userService.validateToken(token);
                if (validatedId != null && !validatedId.equals(senderId)) {
                    sendError(ctx, sequence, "Invalid sender ID");
                    return;
                }
            }
        }
        
        if (FAST_MESSAGE_TYPES.contains(type)) {
            processMessage(ctx, sequence, type, message);
        } else {
            executorService.execute(() -> {
                try {
                    processMessage(ctx, sequence, type, message);
                } catch (Exception e) {
                    log.error("Error processing message in executor", e);
                    sendError(ctx, sequence, "Internal server error");
                }
            });
        }
    }
    
    private void processMessage(ChannelHandlerContext ctx, int sequence, 
                                GameProtocol.MessageType type,
                                GameProtocol.GameMessage message) {
        switch (type) {
            case MSG_LOGIN_REQ:
                handleLogin(ctx, sequence, message);
                break;
            case MSG_REGISTER_REQ:
                handleRegister(ctx, sequence, message);
                break;
            case MSG_LOGOUT_REQ:
                handleLogout(ctx, sequence, message);
                break;
            case MSG_HEARTBEAT_REQ:
                handleHeartbeat(ctx, sequence);
                break;
            case MSG_CREATE_ROOM_REQ:
                handleCreateRoom(ctx, sequence, message);
                break;
            case MSG_JOIN_ROOM_REQ:
                handleJoinRoom(ctx, sequence, message);
                break;
            case MSG_LEAVE_ROOM_REQ:
                handleLeaveRoom(ctx, sequence, message);
                break;
            case MSG_ROOM_LIST_REQ:
                handleRoomList(ctx, sequence, message);
                break;
            case MSG_SELECT_HERO_REQ:
                handleSelectHero(ctx, sequence, message);
                break;
            case MSG_START_GAME_REQ:
                handleStartGame(ctx, sequence, message);
                break;
            case MSG_ACTION_REQ:
                handleAction(ctx, sequence, message);
                break;
            case MSG_RECONNECT_REQ:
                handleReconnect(ctx, sequence, message);
                break;
            case MSG_REPLAY_LIST_REQ:
                handleReplayList(ctx, sequence, message);
                break;
            case MSG_REPLAY_PLAY_REQ:
                handleReplayPlay(ctx, sequence, message);
                break;
            case MSG_LEADERBOARD_REQ:
                handleLeaderboard(ctx, sequence, message);
                break;
            case MSG_FRIEND_LIST_REQ:
                handleFriendList(ctx, sequence, message);
                break;
            case MSG_ADD_FRIEND_REQ:
                handleAddFriend(ctx, sequence, message);
                break;
            case MSG_ACCEPT_FRIEND_REQ:
                handleAcceptFriend(ctx, sequence, message);
                break;
            case MSG_REMOVE_FRIEND_REQ:
                handleRemoveFriend(ctx, sequence, message);
                break;
            case MSG_FRIEND_REQUEST_LIST_REQ:
                handleFriendRequestList(ctx, sequence, message);
                break;
            case MSG_INVITE_FRIEND_REQ:
                handleInviteFriend(ctx, sequence, message);
                break;
            case MSG_ACCEPT_INVITE_REQ:
                handleAcceptInvite(ctx, sequence, message);
                break;
            case MSG_DECLINE_INVITE_REQ:
                handleDeclineInvite(ctx, sequence, message);
                break;
            case MSG_CREATE_AI_ROOM_REQ:
                handleCreateAIRoom(ctx, sequence, message);
                break;
            default:
                log.warn("Unknown message type: {}", type);
                sendError(ctx, sequence, "Unknown message type");
        }
    }
    
    @Override
    public void channelActive(ChannelHandlerContext ctx) throws Exception {
        log.info("Client connected: {}", ctx.channel().remoteAddress());
        super.channelActive(ctx);
    }
    
    @Override
    public void channelInactive(ChannelHandlerContext ctx) throws Exception {
        log.info("Client disconnected: {}", ctx.channel().remoteAddress());
        handleDisconnect(ctx);
        super.channelInactive(ctx);
    }
    
    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
        if (evt instanceof IdleStateEvent) {
            IdleStateEvent event = (IdleStateEvent) evt;
            if (event.state() == IdleState.READER_IDLE) {
                log.info("Channel idle timeout: {}", ctx.channel().remoteAddress());
                ctx.close();
            }
        }
        super.userEventTriggered(ctx, evt);
    }
    
    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
        log.error("Exception in channel: {}", ctx.channel().remoteAddress(), cause);
        ctx.close();
    }
    
    private void handleLogin(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        GameProtocol.LoginRequest req = message.getLoginRequest();
        Map<String, Object> result = userService.login(req.getUsername(), req.getPassword());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.LoginResponse.Builder builder = GameProtocol.LoginResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        if (success) {
            String token = (String) result.get("token");
            PlayerInfo playerInfo = (PlayerInfo) result.get("playerInfo");
            
            builder.setToken(token);
            builder.setPlayerInfo(playerInfo.toProto());
            
            playerChannels.put(String.valueOf(playerInfo.getUserId()), ctx.channel());
            channelPlayers.put(ctx.channel(), playerInfo.getUserId());
            channelTokens.put(ctx.channel(), token);
            redisService.savePlayerSession(playerInfo.getUserId(), ctx.channel().id().asShortText());
            
            playerInfo.setStatus(GameProtocol.PlayerStatus.PLAYER_ONLINE);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_LOGIN_RES,
                    GameProtocol.GameMessage.newBuilder().setLoginResponse(builder).build());
    }
    
    private void handleRegister(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        GameProtocol.RegisterRequest req = message.getRegisterRequest();
        Map<String, Object> result = userService.register(
                req.getUsername(), req.getPassword(), 
                req.getEmail(), req.getNickname());
        
        GameProtocol.RegisterResponse response = GameProtocol.RegisterResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setMessage((String) result.get("message"))
                .setUserId(result.containsKey("userId") ? (Long) result.get("userId") : 0L)
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_REGISTER_RES,
                    GameProtocol.GameMessage.newBuilder().setRegisterResponse(response).build());
    }
    
    private void handleLogout(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId != null) {
            Room room = roomService.getRoomByPlayer(userId);
            if (room != null) {
                roomService.handlePlayerDisconnect(userId);
                broadcastRoomUpdate(room);
            }
            
            userService.logout(userId);
            playerChannels.remove(String.valueOf(userId));
            redisService.deletePlayerSession(userId);
        }
        
        channelPlayers.remove(ctx.channel());
        channelTokens.remove(ctx.channel());
        
        GameProtocol.LoginResponse response = GameProtocol.LoginResponse.newBuilder()
                .setSuccess(true)
                .setMessage("Logout successful")
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_LOGOUT_RES,
                    GameProtocol.GameMessage.newBuilder().setLoginResponse(response).build());
    }
    
    private void handleHeartbeat(ChannelHandlerContext ctx, int sequence) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId != null) {
            redisService.extendSession(userId);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_HEARTBEAT_RES,
                    GameProtocol.GameMessage.newBuilder().build());
    }
    
    private void handleCreateRoom(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.CreateRoomRequest req = message.getCreateRoomRequest();
        Map<String, Object> result = roomService.createRoom(
                userId, req.getRoomName(), req.getMaxPlayers(),
                req.getPassword(), req.getGameMode());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.CreateRoomResponse.Builder builder = GameProtocol.CreateRoomResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        if (success) {
            Room room = (Room) result.get("room");
            builder.setRoomInfo(room.toProto());
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_CREATE_ROOM_RES,
                    GameProtocol.GameMessage.newBuilder().setCreateRoomResponse(builder).build());
    }
    
    private void handleJoinRoom(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.JoinRoomRequest req = message.getJoinRoomRequest();
        Map<String, Object> result = roomService.joinRoom(userId, req.getRoomId(), req.getPassword());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.JoinRoomResponse.Builder builder = GameProtocol.JoinRoomResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        if (success) {
            Room room = (Room) result.get("room");
            builder.setRoomInfo(room.toProto());
            broadcastRoomUpdate(room);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_JOIN_ROOM_RES,
                    GameProtocol.GameMessage.newBuilder().setJoinRoomResponse(builder).build());
    }
    
    private void handleLeaveRoom(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "You are not in any room");
            return;
        }
        
        Room room = roomService.getRoomByPlayer(userId);
        Map<String, Object> result = roomService.leaveRoom(userId);
        
        GameProtocol.LeaveRoomResponse response = GameProtocol.LeaveRoomResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setMessage((String) result.get("message"))
                .build();
        
        if (room != null) {
            broadcastRoomUpdate(room);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_LEAVE_ROOM_RES,
                    GameProtocol.GameMessage.newBuilder().setLeaveRoomResponse(response).build());
    }
    
    private void handleRoomList(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        GameProtocol.RoomListRequest req = message.getRoomListRequest();
        java.util.List<Room> rooms = roomService.getRoomList(req.getPage(), req.getPageSize(), req.getOnlyAvailable());
        
        GameProtocol.RoomListResponse.Builder builder = GameProtocol.RoomListResponse.newBuilder()
                .setSuccess(true)
                .setMessage("success")
                .setTotal(roomService.getTotalRooms());
        
        for (Room room : rooms) {
            builder.addRooms(room.toProto());
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_ROOM_LIST_RES,
                    GameProtocol.GameMessage.newBuilder().setRoomListResponse(builder).build());
    }
    
    private void handleSelectHero(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.SelectHeroRequest req = message.getSelectHeroRequest();
        Map<String, Object> result = roomService.selectHero(userId, req.getHeroId(), req.getPosition());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.SelectHeroResponse response = GameProtocol.SelectHeroResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"))
                .build();
        
        if (success) {
            Room room = roomService.getRoomByPlayer(userId);
            if (room != null) {
                broadcastRoomUpdate(room);
            }
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_SELECT_HERO_RES,
                    GameProtocol.GameMessage.newBuilder().setSelectHeroResponse(response).build());
    }
    
    private void handleStartGame(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        Map<String, Object> result = gameService.startGame(userId);
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.SelectHeroResponse response = GameProtocol.SelectHeroResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"))
                .build();
        
        if (success) {
            GameState gameState = (GameState) result.get("gameState");
            Room room = roomService.getRoomByPlayer(userId);
            
            if (room != null) {
                GameProtocol.GameMessage startNotify = GameProtocol.GameMessage.newBuilder()
                        .setGameState(gameState.toProto())
                        .build();
                
                for (PlayerInfo player : room.getPlayerList()) {
                    sendMessageToPlayer(player.getUserId(), 0, 
                                       GameProtocol.MessageType.MSG_GAME_START_NOTIFY, startNotify);
                }
            }
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_START_GAME_RES,
                    GameProtocol.GameMessage.newBuilder().setSelectHeroResponse(response).build());
    }
    
    private void handleAction(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.ActionRequest req = message.getActionRequest();
        com.game.model.ActionResult result = gameService.handleAction(userId, req);
        
        GameProtocol.ActionResult protoResult = result.toProto();
        
        GameProtocol.GameMessage response = GameProtocol.GameMessage.newBuilder()
                .setActionResult(protoResult)
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_ACTION_RES, response);
        
        if (result.isSuccess()) {
            Room room = roomService.getRoomByPlayer(userId);
            if (room != null && room.getGameState() != null) {
                GameState gameState = room.getGameState();
                
                GameProtocol.GameMessage broadcast = GameProtocol.GameMessage.newBuilder()
                        .setActionResult(protoResult)
                        .build();
                
                for (PlayerInfo player : room.getPlayerList()) {
                    sendMessageToPlayer(player.getUserId(), 0,
                                       GameProtocol.MessageType.MSG_ACTION_BROADCAST, broadcast);
                }
                
                GameProtocol.GameMessage stateNotify = GameProtocol.GameMessage.newBuilder()
                        .setGameState(gameState.toProto())
                        .build();
                
                for (PlayerInfo player : room.getPlayerList()) {
                    sendMessageToPlayer(player.getUserId(), 0,
                                       GameProtocol.MessageType.MSG_GAME_STATE_NOTIFY, stateNotify);
                }
                
                if (gameState.isGameOver()) {
                    GameProtocol.MatchRecord matchRecord = createMatchRecord(gameState, room);
                    GameProtocol.GameMessage endNotify = GameProtocol.GameMessage.newBuilder()
                            .setMatchRecord(matchRecord)
                            .build();
                    
                    for (PlayerInfo player : room.getPlayerList()) {
                        sendMessageToPlayer(player.getUserId(), 0,
                                           GameProtocol.MessageType.MSG_GAME_END_NOTIFY, endNotify);
                    }
                }
            }
        }
    }
    
    private void handleReconnect(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        GameProtocol.ReconnectRequest req = message.getReconnectRequest();
        Long userId = userService.validateToken(req.getToken());
        
        if (userId == null) {
            GameProtocol.ReconnectResponse response = GameProtocol.ReconnectResponse.newBuilder()
                    .setSuccess(false)
                    .setMessage("Invalid token")
                    .setInGame(false)
                    .build();
            
            sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_RECONNECT_RES,
                        GameProtocol.GameMessage.newBuilder().setReconnectResponse(response).build());
            return;
        }
        
        playerChannels.put(String.valueOf(userId), ctx.channel());
        channelPlayers.put(ctx.channel(), userId);
        channelTokens.put(ctx.channel(), req.getToken());
        redisService.savePlayerSession(userId, ctx.channel().id().asShortText());
        
        GameProtocol.ReconnectResponse.Builder builder = GameProtocol.ReconnectResponse.newBuilder()
                .setSuccess(true)
                .setMessage("Reconnected");
        
        Room room = null;
        if (req.getRoomId() != null && !req.getRoomId().isEmpty()) {
            room = roomService.handleReconnect(userId, req.getRoomId());
        } else {
            room = roomService.getRoomByPlayer(userId);
        }
        
        if (room != null) {
            builder.setRoomInfo(room.toProto());
            
            if (room.getGameState() != null) {
                builder.setInGame(true);
                builder.setGameState(room.getGameState().toProto());
            } else {
                builder.setInGame(false);
            }
            
            broadcastRoomUpdate(room);
        } else {
            builder.setInGame(false);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_RECONNECT_RES,
                    GameProtocol.GameMessage.newBuilder().setReconnectResponse(builder).build());
    }
    
    private void handleReplayList(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        GameProtocol.ReplayListRequest req = message.getReplayListRequest();
        java.util.List<GameProtocol.MatchRecord> records = replayService.getReplayList(
                req.getUserId() > 0 ? req.getUserId() : null,
                req.getPage(), req.getPageSize());
        
        GameProtocol.ReplayListResponse response = GameProtocol.ReplayListResponse.newBuilder()
                .setSuccess(true)
                .setMessage("success")
                .setTotal(records.size())
                .addAllMatches(records)
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_REPLAY_LIST_RES,
                    GameProtocol.GameMessage.newBuilder().setReplayListResponse(response).build());
    }
    
    private void handleReplayPlay(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        GameProtocol.ReplayPlayRequest req = message.getReplayPlayRequest();
        com.game.model.ReplayData replayData = replayService.loadReplay(req.getMatchId());
        
        GameProtocol.ReplayPlayResponse.Builder builder = GameProtocol.ReplayPlayResponse.newBuilder();
        
        if (replayData != null) {
            builder.setSuccess(true)
                   .setMessage("success")
                   .setMatchInfo(createMatchRecordFromReplay(replayData));
        } else {
            builder.setSuccess(false)
                   .setMessage("Replay not found");
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_REPLAY_PLAY_RES,
                    GameProtocol.GameMessage.newBuilder().setReplayPlayResponse(builder.build()).build());
    }
    
    private void handleDisconnect(ChannelHandlerContext ctx) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId != null) {
            Room room = roomService.getRoomByPlayer(userId);
            if (room != null) {
                roomService.handlePlayerDisconnect(userId);
                broadcastRoomUpdate(room);
            }
            
            playerChannels.remove(String.valueOf(userId));
            redisService.deletePlayerSession(userId);
        }
        
        channelPlayers.remove(ctx.channel());
        channelTokens.remove(ctx.channel());
    }
    
    private void broadcastRoomUpdate(Room room) {
        GameProtocol.GameMessage message = GameProtocol.GameMessage.newBuilder()
                .setRoomInfo(room.toProto())
                .build();
        
        for (PlayerInfo player : room.getPlayerList()) {
            if (player.getStatus() != GameProtocol.PlayerStatus.PLAYER_DISCONNECTED) {
                sendMessageToPlayer(player.getUserId(), 0,
                                   GameProtocol.MessageType.MSG_ROOM_UPDATE_NOTIFY, message);
            }
        }
    }
    
    private GameProtocol.MatchRecord createMatchRecord(GameState gameState, Room room) {
        GameProtocol.MatchRecord.Builder builder = GameProtocol.MatchRecord.newBuilder()
                .setMatchId(gameState.getMatchId())
                .setRoomId(room.getRoomId())
                .setStartTime(room.getCreateTime())
                .setEndTime(System.currentTimeMillis())
                .setDuration((int)((System.currentTimeMillis() - room.getCreateTime()) / 1000))
                .setTotalTurns(gameState.getCurrentTurn());
        
        for (PlayerInfo player : room.getPlayerList()) {
            builder.addPlayers(player.toProto());
        }
        
        return builder.build();
    }
    
    private GameProtocol.MatchRecord createMatchRecordFromReplay(com.game.model.ReplayData replay) {
        GameProtocol.MatchRecord.Builder builder = GameProtocol.MatchRecord.newBuilder()
                .setMatchId(replay.getMatchId())
                .setRoomId(replay.getRoomId())
                .setStartTime(replay.getStartTime())
                .setEndTime(replay.getEndTime())
                .setDuration(replay.getDurationSeconds())
                .setTotalTurns(replay.getTotalTurns());
        
        for (PlayerInfo player : replay.getPlayers()) {
            builder.addPlayers(player.toProto());
        }
        
        return builder.build();
    }
    
    private void sendError(ChannelHandlerContext ctx, int sequence, String message) {
        GameProtocol.LoginResponse response = GameProtocol.LoginResponse.newBuilder()
                .setSuccess(false)
                .setMessage(message)
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_LOGIN_RES,
                    GameProtocol.GameMessage.newBuilder().setLoginResponse(response).build());
    }
    
    private void sendMessage(ChannelHandlerContext ctx, int sequence,
                            GameProtocol.MessageType type,
                            GameProtocol.GameMessage payload) {
        try {
            GameProtocol.GameMessage message = GameProtocol.GameMessage.newBuilder()
                    .mergeFrom(payload)
                    .setSequence(sequence)
                    .setType(type)
                    .setTimestamp(System.currentTimeMillis())
                    .build();
            
            byte[] bytes = message.toByteArray();
            io.netty.buffer.ByteBuf buffer = io.netty.buffer.Unpooled.wrappedBuffer(bytes);
            ctx.channel().writeAndFlush(new BinaryWebSocketFrame(buffer));
            
        } catch (Exception e) {
            log.error("Failed to send message", e);
        }
    }
    
    private void sendMessageToPlayer(Long playerId, int sequence,
                                     GameProtocol.MessageType type,
                                     GameProtocol.GameMessage payload) {
        Channel channel = playerChannels.get(String.valueOf(playerId));
        if (channel != null && channel.isActive()) {
            try {
                GameProtocol.GameMessage message = GameProtocol.GameMessage.newBuilder()
                        .mergeFrom(payload)
                        .setSequence(sequence)
                        .setType(type)
                        .setSenderId(0)
                        .setTimestamp(System.currentTimeMillis())
                        .build();
                
                byte[] bytes = message.toByteArray();
                io.netty.buffer.ByteBuf buffer = io.netty.buffer.Unpooled.wrappedBuffer(bytes);
                channel.writeAndFlush(new BinaryWebSocketFrame(buffer));
                
            } catch (Exception e) {
                log.error("Failed to send message to player {}", playerId, e);
            }
        }
    }
    
    private void handleLeaderboard(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        
        GameProtocol.LeaderboardRequest req = message.getLeaderboardRequest();
        Map<String, Object> result = leaderboardService.getLeaderboard(
                req.getType(), req.getPage(), req.getPageSize(), userId);
        
        GameProtocol.LeaderboardResponse.Builder builder = GameProtocol.LeaderboardResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setType(req.getType())
                .setTotal(((Number) result.get("total")).intValue())
                .setPlayerRank(((Number) result.getOrDefault("playerRank", 0)).intValue());
        
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) result.get("entries");
        for (Map<String, Object> entry : entries) {
            GameProtocol.LeaderboardEntry.Builder entryBuilder = GameProtocol.LeaderboardEntry.newBuilder()
                    .setRank(((Number) entry.get("rank")).intValue())
                    .setValue(((Number) entry.get("value")).intValue());
            
            PlayerInfo player = (PlayerInfo) entry.get("player");
            if (player != null) {
                entryBuilder.setPlayer(player.toProto());
            }
            
            builder.addEntries(entryBuilder);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_LEADERBOARD_RES,
                    GameProtocol.GameMessage.newBuilder().setLeaderboardResponse(builder).build());
    }
    
    private void handleFriendList(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        List<Map<String, Object>> friends = friendService.getFriendList(userId);
        
        GameProtocol.FriendListResponse.Builder builder = GameProtocol.FriendListResponse.newBuilder()
                .setSuccess(true)
                .setMessage("success");
        
        for (Map<String, Object> friend : friends) {
            @SuppressWarnings("unchecked")
            Map<String, Object> friendInfo = (Map<String, Object>) friend.get("friend");
            GameProtocol.FriendInfo.Builder friendBuilder = GameProtocol.FriendInfo.newBuilder()
                    .setUserId(((Number) friend.get("userId")).longValue())
                    .setUsername((String) friendInfo.getOrDefault("username", ""))
                    .setNickname((String) friendInfo.getOrDefault("nickname", ""))
                    .setAvatar((String) friendInfo.getOrDefault("avatar", ""))
                    .setLevel(((Number) friendInfo.getOrDefault("level", 0)).intValue())
                    .setRating(((Number) friendInfo.getOrDefault("rating", 0)).intValue())
                    .setStatus((GameProtocol.PlayerStatus) friendInfo.getOrDefault("status", GameProtocol.PlayerStatus.PLAYER_OFFLINE))
                    .setFriendStatus((GameProtocol.FriendStatus) friendInfo.getOrDefault("friendStatus", GameProtocol.FriendStatus.FRIEND_ACCEPTED));
            
            if (friend.get("alias") != null) {
                friendBuilder.setAlias((String) friend.get("alias"));
            }
            
            builder.addFriends(friendBuilder);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_FRIEND_LIST_RES,
                    GameProtocol.GameMessage.newBuilder().setFriendListResponse(builder).build());
    }
    
    private void handleAddFriend(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.AddFriendRequest req = message.getAddFriendRequest();
        Map<String, Object> result = friendService.sendFriendRequest(userId, req.getUsername(), req.getMessage());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.AddFriendResponse.Builder builder = GameProtocol.AddFriendResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_ADD_FRIEND_RES,
                    GameProtocol.GameMessage.newBuilder().setAddFriendResponse(builder).build());
    }
    
    private void handleAcceptFriend(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.AcceptFriendRequest req = message.getAcceptFriendRequest();
        Map<String, Object> result = friendService.acceptFriendRequest(userId, req.getFriendId(), req.getAccept());
        
        GameProtocol.AcceptFriendResponse response = GameProtocol.AcceptFriendResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setMessage((String) result.get("message"))
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_ACCEPT_FRIEND_RES,
                    GameProtocol.GameMessage.newBuilder().setAcceptFriendResponse(response).build());
    }
    
    private void handleRemoveFriend(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.RemoveFriendRequest req = message.getRemoveFriendRequest();
        Map<String, Object> result = friendService.removeFriend(userId, req.getFriendId());
        
        GameProtocol.RemoveFriendResponse response = GameProtocol.RemoveFriendResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setMessage((String) result.get("message"))
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_REMOVE_FRIEND_RES,
                    GameProtocol.GameMessage.newBuilder().setRemoveFriendResponse(response).build());
    }
    
    private void handleFriendRequestList(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        Map<String, Object> result = friendService.getFriendRequests(userId);
        
        GameProtocol.FriendRequestListResponse.Builder builder = GameProtocol.FriendRequestListResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setMessage("success");
        
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> pendingRequests = (List<Map<String, Object>>) result.get("pendingRequests");
        for (Map<String, Object> req : pendingRequests) {
            GameProtocol.FriendRequest.Builder reqBuilder = GameProtocol.FriendRequest.newBuilder()
                    .setRequestId(((Number) req.get("requestId")).longValue())
                    .setMessage((String) req.getOrDefault("message", ""))
                    .setStatus(GameProtocol.FriendStatus.FRIEND_PENDING);
            
            PlayerInfo fromUser = (PlayerInfo) req.get("fromUser");
            if (fromUser != null) {
                reqBuilder.setFromUser(fromUser.toProto());
            }
            
            builder.addPendingRequests(reqBuilder);
        }
        
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sentRequests = (List<Map<String, Object>>) result.get("sentRequests");
        for (Map<String, Object> req : sentRequests) {
            GameProtocol.FriendRequest.Builder reqBuilder = GameProtocol.FriendRequest.newBuilder()
                    .setRequestId(((Number) req.get("requestId")).longValue())
                    .setMessage((String) req.getOrDefault("message", ""))
                    .setStatus(GameProtocol.FriendStatus.FRIEND_PENDING);
            
            builder.addSentRequests(reqBuilder);
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_FRIEND_REQUEST_LIST_RES,
                    GameProtocol.GameMessage.newBuilder().setFriendRequestListResponse(builder).build());
    }
    
    private void handleInviteFriend(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.InviteFriendRequest req = message.getInviteFriendRequest();
        Map<String, Object> result = inviteService.sendGameInvite(userId, req.getFriendId(), req.getRoomId(), req.getMessage());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.InviteFriendResponse.Builder builder = GameProtocol.InviteFriendResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        if (success && result.containsKey("inviteId")) {
            builder.setInviteId((String) result.get("inviteId"));
            
            if (result.containsKey("invitee")) {
                PlayerInfo invitee = (PlayerInfo) result.get("invitee");
                if (invitee != null && userService.isOnline(invitee.getUserId())) {
                    GameProtocol.GameInvite invite = GameProtocol.GameInvite.newBuilder()
                            .setInviteId((String) result.get("inviteId"))
                            .setInviter(userService.getPlayerInfo(userId).toProto())
                            .setRoomId(req.getRoomId())
                            .setMessage(req.getMessage())
                            .setExpiresAt(System.currentTimeMillis() + 5 * 60 * 1000)
                            .build();
                    
                    GameProtocol.GameMessage notify = GameProtocol.GameMessage.newBuilder()
                            .setGameInvite(invite)
                            .build();
                    
                    sendMessageToPlayer(invitee.getUserId(), 0, GameProtocol.MessageType.MSG_INVITE_NOTIFY, notify);
                }
            }
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_INVITE_FRIEND_RES,
                    GameProtocol.GameMessage.newBuilder().setInviteFriendResponse(builder).build());
    }
    
    private void handleAcceptInvite(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.AcceptInviteRequest req = message.getAcceptInviteRequest();
        Map<String, Object> result = inviteService.acceptInvite(userId, req.getInviteId());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.AcceptInviteResponse.Builder builder = GameProtocol.AcceptInviteResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        if (success && result.containsKey("room")) {
            Room room = (Room) result.get("room");
            builder.setRoomInfo(room.toProto());
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_ACCEPT_INVITE_RES,
                    GameProtocol.GameMessage.newBuilder().setAcceptInviteResponse(builder).build());
    }
    
    private void handleDeclineInvite(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.DeclineInviteRequest req = message.getDeclineInviteRequest();
        Map<String, Object> result = inviteService.declineInvite(userId, req.getInviteId());
        
        GameProtocol.DeclineInviteResponse response = GameProtocol.DeclineInviteResponse.newBuilder()
                .setSuccess((Boolean) result.get("success"))
                .setMessage((String) result.get("message"))
                .build();
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_DECLINE_INVITE_RES,
                    GameProtocol.GameMessage.newBuilder().setDeclineInviteResponse(response).build());
    }
    
    private void handleCreateAIRoom(ChannelHandlerContext ctx, int sequence, GameProtocol.GameMessage message) {
        Long userId = channelPlayers.get(ctx.channel());
        if (userId == null) {
            sendError(ctx, sequence, "Please login first");
            return;
        }
        
        GameProtocol.CreateAIRoomRequest req = message.getCreateAIRoomRequest();
        Map<String, Object> result = aiService.createAIRoom(userId, req.getAiCount(), req.getDifficulty(), 
                                                              req.getHeroId().isEmpty() ? null : req.getHeroId());
        
        boolean success = (Boolean) result.get("success");
        
        GameProtocol.CreateAIRoomResponse.Builder builder = GameProtocol.CreateAIRoomResponse.newBuilder()
                .setSuccess(success)
                .setMessage((String) result.get("message"));
        
        if (success && result.containsKey("room")) {
            Room room = (Room) result.get("room");
            builder.setRoomInfo(room.toProto());
        }
        
        sendMessage(ctx, sequence, GameProtocol.MessageType.MSG_CREATE_AI_ROOM_RES,
                    GameProtocol.GameMessage.newBuilder().setCreateAIRoomResponse(builder).build());
    }
}
