import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConversationService } from '../chat/conversation.service';
import { MessageDocument } from '../chat/schemas/message.schema';

// --- 定义好友请求通知数据结构 ---
export interface FriendRequestNotificationData {
  requestId: string;
  sender: {
    _id: string;
    username: string;
    nickname: string;
    avatar: string;
  };
  message: string;
  createdAt: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'ignored';
}

// --- 定义好友请求状态更新的通知数据结构 ---
export interface FriendRequestUpdateData {
  requestId: string;
  status: 'accepted' | 'rejected';
  // handler?: { _id: string; nickname: string; }; // 处理者信息（可选）
}

// --- 定义新通知的通知数据结构 ---
export interface NewInformNotificationData {
  id: string; // 通知ID
  title: string; // 通知标题
  importance: 'low' | 'medium' | 'high'; // 通知重要性
  senderName?: string; // 可选，发送者名称
  createdAt: Date; // 创建时间
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // 在生产环境中应限制为特定域
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // 存储用户ID和对应的socket连接及用户名
  private onlineUsers = new Map<string, { socketId: string, username: string }>();

  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => ConversationService))
    private conversationService: ConversationService,
  ) {}

  afterInit() {
    this.logger.log('通知 WebSocket 网关已初始化');
  }

  // 用户连接时
  async handleConnection(client: Socket) {
    try {
      // 获取认证信息 - 从 query 参数、auth 对象或 headers 中获取
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '') ||
        (client.handshake.query.token as string);

      if (!token) {
        this.logger.warn('连接尝试没有提供token，断开连接');
        client.disconnect();
        return;
      }

      // 验证 token
      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch (e) {
        this.logger.warn(`无效的token: ${(e as Error).message}，断开连接`);
        client.disconnect();
        return;
      }

      // 获取用户ID 和 用户名
      const userId = payload.sub;
      const username = payload.username; // 从 JWT payload 获取用户名

      if (!userId || !username) {
        // 确保两者都存在
        this.logger.warn('Token中未找到用户ID或用户名，断开连接');
        client.disconnect();
        return;
      }

      // 保存用户连接
      this.onlineUsers.set(userId, { socketId: client.id, username });

      // 将用户ID和用户名附加到socket对象，便于后续使用
      client.data.userId = userId;
      client.data.username = username; // 存储用户名

      // 更新日志，包含用户名
      this.logger.log(
        `用户 ${username} (ID: ${userId}) 已连接。Socket ID: ${client.id}。当前在线用户数: ${this.onlineUsers.size}`,
      );

      // 加入用户相关的群聊房间
      try {
        const groupIds = await this.conversationService.getUserGroupIds(userId);
        groupIds.forEach(groupId => {
          const roomName = `group_${groupId}`;
          client.join(roomName);
          this.logger.log(`用户 ${username} (ID: ${userId}) 加入房间 ${roomName}`);
        });
      } catch (groupError) {
        this.logger.error(`用户 ${username} (ID: ${userId}) 加入群聊房间时出错: ${(groupError as Error).message}`);
        // 考虑是否需要因此断开连接，或仅记录错误
      }

      // 发送连接成功消息
      client.emit('connected', {
        status: 'success',
        message: '成功连接到通知服务',
      });
    } catch (error) {
      this.logger.error(`连接处理错误: ${(error as Error).message}`);
      client.disconnect();
    }
  }

  // 用户断开连接
  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    const username = client.data?.username || '未知用户'; // 获取用户名，提供默认值

    if (userId) {
      const userInfo = this.onlineUsers.get(userId);
      // 确保断开的是当前用户的这个socket连接
      if (userInfo && userInfo.socketId === client.id) {
        this.onlineUsers.delete(userId);
        this.logger.log(
          `用户 ${username} (ID: ${userId}) 已断开连接。Socket ID: ${client.id}。当前在线用户数: ${this.onlineUsers.size}`,
        );
      } else if (userInfo) {
        // SocketId不匹配，可能是旧的连接
        this.logger.warn(
          `用户 ${username} (ID: ${userId}) 的旧连接尝试断开 (socket ${client.id})，但当前存储的socket为 ${userInfo.socketId}。未从在线列表移除此用户。`,
        );
      } else {
        // 用户存在于client.data，但不在onlineUsers map中
         this.logger.warn(
          `用户 ${username} (ID: ${userId}) 已断开连接 (Socket ID: ${client.id})，但在在线用户映射中未找到。`,
        );
      }
    } else {
      // 如果client.data中没有userId，尝试通过socketId反查 (这种情况应较少)
      let foundUserId: string | null = null;
      for (const [uid, uInfo] of this.onlineUsers.entries()) {
        if (uInfo.socketId === client.id) {
          foundUserId = uid;
          this.onlineUsers.delete(uid); // 从map中移除
          this.logger.log(
            `用户 (ID: ${uid}, 用户名: ${uInfo.username || 'N/A'}) 通过 Socket ID ${client.id} 断开连接。当前在线用户数: ${this.onlineUsers.size}`,
          );
          break;
        }
      }
      if (!foundUserId) {
        this.logger.log(`客户端断开连接 (ID: ${client.id})，client.data中无userId且在线用户映射中无匹配socketId。`);
      }
    }
  }

  // 发送好友请求通知
  sendFriendRequestNotification(
    userId: string,
    requestData: FriendRequestNotificationData,
  ): boolean {
    try {
      const userInfo = this.onlineUsers.get(userId);
      if (userInfo) {
        this.server.to(userInfo.socketId).emit('newFriendRequest', requestData);
        this.logger.log(
          `已向用户 ${requestData.sender.username} (ID: ${userId}) 发送好友请求通知 (来自: ${requestData.sender.username})`,
        );
        return true;
      } else {
        this.logger.log(
          `用户ID ${userId} 不在线。好友请求通知 (来自: ${requestData.sender.username}) 未发送。`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(`向用户ID ${userId} 发送好友请求通知时出错: ${(error as Error).message}`);
      return false;
    }
  }

  // 发送好友请求状态更新通知
  sendFriendRequestUpdateNotification(
    targetUserId: string,
    data: FriendRequestUpdateData,
  ) {
    const userInfo = this.onlineUsers.get(targetUserId);
    if (userInfo) {
      this.server.to(userInfo.socketId).emit('friendRequestUpdate', data);
      this.logger.log(
        `已向用户ID ${targetUserId} (Socket: ${userInfo.socketId}) 发送好友请求状态更新`,
      );
    } else {
      this.logger.warn(
        `用户ID ${targetUserId} 不在线，未发送好友请求状态更新。`,
      );
    }
  }

  // --- 发送新通知的方法 ---
  sendNewInformNotification(
    userId: string,
    data: NewInformNotificationData,
  ): boolean {
    this.logger.debug(
      `尝试向用户ID ${userId} 发送新通知 (ID: ${data.id}, 标题: ${data.title})`,
    );
    try {
      const userInfo = this.onlineUsers.get(userId);
      if (userInfo) {
        this.server.to(userInfo.socketId).emit('newInform', data); // 使用 'newInform' 作为事件名
        this.logger.log(
          `已向用户ID ${userId} (Socket: ${userInfo.socketId}) 发送新通知 (ID: ${data.id}, 标题: ${data.title})`,
        );
        return true;
      } else {
        this.logger.log(
          `用户ID ${userId} 不在线，未发送新通知 (ID: ${data.id}, 标题: ${data.title})。`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `向用户ID ${userId} 发送新通知 (ID: ${data.id}) 时出错: ${(error as Error).message}`,
      );
      return false;
    }
  }

  // --- 新增聊天方法 ---

  /**
   * 如果特定用户在线，则向其发送私聊消息。
   * @param userId 要发送消息的用户ID。
   * @param message 要发送的消息文档。
   * @returns 如果消息已发送则为 true，否则为 false。
   */
  sendMessageToUser(userId: string, message: MessageDocument): boolean {
    const userInfo = this.onlineUsers.get(userId);
    if (userInfo) {
      this.server.to(userInfo.socketId).emit('chat:newMessage', message);
      this.logger.log(`聊天：已向用户 ${userInfo.username} (ID: ${userId}, SocketID: ${userInfo.socketId}) 发送私聊消息`);
      return true;
    } else {
      this.logger.log(`聊天：用户ID ${userId} 不在线。无法发送私聊消息。`);
      return false;
    }
  }

  /**
   * 向特定群组房间中的所有客户端广播消息。
   * @param groupId 群组的ID。
   * @param message 要广播的消息文档。
   */
  broadcastMessageToGroup(groupId: string, message: MessageDocument) {
    const roomName = `group_${groupId}`;
    this.server.to(roomName).emit('chat:newMessage', message);
    this.logger.log(`聊天：已向群组房间 ${roomName} 广播消息 (消息ID: ${message._id})`);
  }
}
