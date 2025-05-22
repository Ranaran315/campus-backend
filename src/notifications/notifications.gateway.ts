import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

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
  // handler?: { _id: string; nickname: string; };
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

  private readonly logger = new Logger('NotificationsGateway');

  // 存储用户ID和对应的socket连接
  private connectedUsers = new Map<string, string>(); // 目前仅支持一人一端

  constructor(private jwtService: JwtService) {}

  afterInit() {
    this.logger.log('Notifications WebSocket Gateway initialized');
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
        this.logger.warn('连接尝试没有提供token');
        client.disconnect();
        return;
      }

      // 验证 token
      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch (e) {
        this.logger.warn(`无效的token: ${e.message}`);
        client.disconnect();
        return;
      }

      // 获取用户ID 和 用户名
      const userId = payload.sub;
      const username = payload.username; // 从 JWT payload 获取用户名

      if (!userId || !username) {
        // 确保两者都存在
        this.logger.warn('Token中未找到用户ID或用户名');
        client.disconnect();
        return;
      }

      // 保存用户连接
      this.connectedUsers.set(userId, client.id);

      // 将用户ID和用户名附加到socket对象，便于后续使用
      client.data.userId = userId;
      client.data.username = username; // 存储用户名

      // 更新日志，包含用户名
      this.logger.log(
        `用户 ${username} (ID: ${userId}) 已连接。当前在线用户数: ${this.connectedUsers.size}`,
      );

      // 发送连接成功消息
      client.emit('connected', {
        status: 'success',
        message: '成功连接到通知服务',
      });
    } catch (error) {
      this.logger.error(`连接处理错误: ${error.message}`);
      client.disconnect();
    }
  }

  // 用户断开连接
  async handleDisconnect(client: Socket) {
    try {
      // 尝试从client.data中获取userId和username
      const userId = client.data?.userId;
      const username = client.data?.username || '未知用户'; // 获取用户名，提供默认值

      if (userId && this.connectedUsers.has(userId)) {
        // 确保断开的是正确的 socket 连接
        if (this.connectedUsers.get(userId) === client.id) {
          this.connectedUsers.delete(userId);
          // 更新日志，包含用户名
          this.logger.log(
            `用户 ${username} (ID: ${userId}) 已断开连接。当前在线用户数: ${this.connectedUsers.size}`,
          );
        } else {
          this.logger.warn(
            `用户 ${username} (ID: ${userId}) 的旧连接尝试断开，但当前连接ID不匹配。`,
          );
        }
      } else {
        // 如果没有直接的userId，尝试通过socketId查找 (这种情况理论上不应频繁发生)
        for (const [uid, socketId] of this.connectedUsers.entries()) {
          if (socketId === client.id) {
            this.connectedUsers.delete(uid);
            // 此时无法直接获取用户名，除非在连接时也存储了 username -> userId 的映射
            this.logger.log(
              `用户 (ID: ${uid}) 通过 Socket ID ${client.id} 断开连接。当前在线用户数: ${this.connectedUsers.size}`,
            );
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error(`断开连接处理错误: ${error.message}`);
    }
  }

  // 发送好友请求通知
  sendFriendRequestNotification(
    userId: string,
    requestData: FriendRequestNotificationData,
  ): boolean {
    try {
      const socketId = this.connectedUsers.get(userId);
      if (socketId) {
        this.server.to(socketId).emit('newFriendRequest', requestData);
        this.logger.log(
          `已向用户ID ${userId} 发送好友请求通知 (来自: ${requestData.sender.username})`,
        );
        return true;
      } else {
        this.logger.log(
          `用户ID ${userId} 不在线，未发送好友请求通知 (来自: ${requestData.sender.username})`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(`向用户ID ${userId} 发送通知时出错: ${error.message}`);
      return false;
    }
  }

  // 发送好友请求状态更新通知
  sendFriendRequestUpdateNotification(
    targetUserId: string,
    data: FriendRequestUpdateData,
  ) {
    const socketId = this.connectedUsers.get(targetUserId); // targetUserId 是最初发送请求的人
    if (socketId) {
      this.server.to(socketId).emit('friendRequestUpdate', data);
      this.logger.log(
        `已发送好友请求状态更新通知给用户 ${targetUserId} (Socket: ${socketId})`,
      );
    } else {
      this.logger.warn(
        `用户ID ${targetUserId} 不在线，未发送好友请求状态更新通知`,
      );
    }
  }

  // --- 发送新通知的方法 ---
  sendNewInformNotification(
    userId: string,
    data: NewInformNotificationData,
  ): boolean {
    try {
      const socketId = this.connectedUsers.get(userId);
      if (socketId) {
        this.server.to(socketId).emit('newInform', data); // 使用 'newInform' 作为事件名
        this.logger.log(
          `已向用户ID ${userId} (Socket: ${socketId}) 发送新通知 (ID: ${data.id}, Title: ${data.title})`,
        );
        return true;
      } else {
        this.logger.log(
          `用户ID ${userId} 不在线，未发送新通知 (ID: ${data.id}, Title: ${data.title})`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `向用户ID ${userId} 发送新通知 (ID: ${data.id}) 时出错: ${error.message}`,
      );
      return false;
    }
  }
}
