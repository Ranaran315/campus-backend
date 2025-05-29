import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConversationService } from './conversation.service';
import { MessageDocument } from './schemas/message.schema';
import { Types } from 'mongoose';

@Injectable()
@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: '*', // 适当地限制生产环境中的来源
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  private onlineChatUsers = new Map<string, { socketId: string, username?: string }>();

  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private conversationService: ConversationService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    if (!token) {
      this.logger.warn(`Chat: Connection attempt without token from ${client.id}. Disconnecting.`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      const username = payload.username;

      if (!userId) {
        this.logger.warn(`Chat: Invalid token payload (no userId) for ${client.id}. Disconnecting.`);
        client.disconnect();
        return;
      }

      client.data.userId = userId;
      client.data.username = username;
      this.onlineChatUsers.set(userId, { socketId: client.id, username });

      this.logger.log(
        `Chat: Client connected - ID: ${client.id}, UserID: ${userId}, Username: ${username}. Total online: ${this.onlineChatUsers.size}`,
      );

      // 加入用户相关的群聊房间
      const groupIds = await this.conversationService.getUserGroupIds(userId);
      groupIds.forEach(groupId => {
        const roomName = `group_${groupId}`;
        client.join(roomName);
        this.logger.log(`Chat: User ${userId} (${username}) joined room ${roomName}`);
      });

      client.emit('chatConnected', { message: 'Successfully connected to chat service.' });

    } catch (error) {
      this.logger.warn(`Chat: Token verification failed for ${client.id} - ${error.message}. Disconnecting.`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const username = client.data.username || 'Unknown';

    if (userId) {
      const userInfo = this.onlineChatUsers.get(userId);
      // 确保断开的是当前用户的这个socket连接，以防多标签页等情况下的旧连接清理
      if (userInfo && userInfo.socketId === client.id) {
        this.onlineChatUsers.delete(userId);
        this.logger.log(
          `Chat: Client disconnected - ID: ${client.id}, UserID: ${userId}, Username: ${username}. Total online: ${this.onlineChatUsers.size}`,
        );
      } else if (userInfo) {
        this.logger.log(
          `Chat: Client disconnected (ID: ${client.id}), but socketId did not match stored for UserID: ${userId} (stored: ${userInfo.socketId}). No change to online users map.`
        );
      } else {
         // userId 存在于 client.data 但不在 onlineChatUsers map 中
         this.logger.log(
          `Chat: Client disconnected (ID: ${client.id}), UserID: ${userId} was in client data but not in online map. No change to online users map.`
        );
      }
    } else {
      this.logger.log(`Chat: Client disconnected (ID: ${client.id}), no userId in client data.`);
    }
  }

  sendMessageToUser(userId: string, message: MessageDocument) {
    const userInfo = this.onlineChatUsers.get(userId);
    if (userInfo) {
      this.server.to(userInfo.socketId).emit('newChatMessage', message);
      this.logger.log(`Chat: Sent direct message to UserID: ${userId} (SocketID: ${userInfo.socketId})`);
      return true;
    } else {
      this.logger.log(`Chat: UserID ${userId} not online. Could not send direct message.`);
      return false;
    }
  }

  broadcastMessageToGroup(groupId: string, message: MessageDocument) {
    const roomName = `group_${groupId}`;
    this.server.to(roomName).emit('newChatMessage', message);
    this.logger.log(`Chat: Broadcasted message to group room: ${roomName}`);
  }
  
  // 示例：如果需要从客户端接收消息并通过gateway处理和广播
  // @SubscribeMessage('sendMessageToServer')
  // handleMessage(
  //   @MessageBody() data: { type: 'private' | 'group', content: string, targetId: string /* userId or groupId */ },
  //   @ConnectedSocket() client: Socket
  // ): void {
  //   const senderId = client.data.userId;
  //   this.logger.log(`Chat: Received message from ${senderId}:`, data);
  //   // 这里可以调用 MessageService.createMessage，然后 MessageService 再调用 Gateway 的推送方法
  //   // 或者，如果 DTO 和逻辑允许，可以直接在这里构造 MessageDocument (不推荐，最好保持服务层处理业务逻辑)
  // }
} 