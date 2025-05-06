import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { User, UserDocument } from 'src/users/user.schema';
import {
  FriendRequest,
  FriendRequestDocument,
  FriendRequestStatus,
} from './friendRequest.schema';
import { FriendRelation, FriendRelationDocument } from './friends.schema';
import * as pinyin from 'pinyin'; // 用于处理中文拼音首字母
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { UsersService } from 'src/users/users.service';
import { Logger } from '@nestjs/common';

interface UserInfo {
  _id: Types.ObjectId | string;
  username: string;
  nickname?: string;
  avatar?: string;
}

// friends.service.ts
@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(FriendRelation.name)
    private friendRelationModel: Model<FriendRelationDocument>,
    @InjectModel(FriendRequest.name)
    private friendRequestModel: Model<FriendRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsGateway: NotificationsGateway,
    private usersService: UsersService, // 注入UsersService
  ) {}

  private readonly logger = new Logger('FriendsService'); // 添加日志记录器

  // 获取用户的好友列表
  async getFriends(userId: string): Promise<any[]> {
    const friends = await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate(
        'friend',
        'username nickname avatar onlineStatus lastOnlineTime',
      )
      .sort({ isFavorite: -1, category: 1 })
      .lean();

    return friends;
  }

  // 获取用户的好友列表（按字母排序）
  async getFriendsAlphabetically(userId: string): Promise<any> {
    // 1. 获取用户的所有好友关系
    const relations = await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate('friend', 'username nickname avatar') // 填充好友信息
      .lean();

    // 2. 为每个好友准备排序用的名称（优先使用备注名）
    const friendsWithSortName = relations.map((relation) => {
      const friend = relation.friend as any; // 已通过populate填充
      const displayName = relation.remark || friend.nickname || friend.username;

      // 获取用于排序的首字母（可以使用第三方库如 pinyin 处理中文）
      const sortLetter = this.getFirstLetter(displayName);

      return {
        ...relation,
        friend,
        displayName,
        sortLetter,
      };
    });

    // 3. 按首字母排序
    friendsWithSortName.sort((a, b) =>
      a.sortLetter.localeCompare(b.sortLetter),
    );

    // 4. 按首字母分组
    const groupedFriends = {};
    for (const item of friendsWithSortName) {
      const letter = item.sortLetter.toUpperCase();
      if (!groupedFriends[letter]) {
        groupedFriends[letter] = [];
      }
      groupedFriends[letter].push(item);
    }

    // 5. 转换为前端所需格式
    const result = Object.keys(groupedFriends)
      .sort()
      .map((letter) => ({
        letter,
        friends: groupedFriends[letter],
      }));

    return result;
  }

  // 获取字符串的首字母（简单版，实际应考虑中文拼音）
  private getFirstLetter(str: string): string {
    if (!str || str.length === 0) return '#';

    // 对中文字符获取拼音首字母
    const pinyinResult = pinyin(str.charAt(0), {
      style: pinyin.STYLE_FIRST_LETTER,
    });

    const first = str.charAt(0).toUpperCase();
    // 字母返回自身，非字母返回#
    return /[A-Z]/.test(first) ? first : '#';
  }

  // 发送好友请求
  async sendFriendRequest(
    senderId: string,
    receiverId: string,
    message?: string,
  ): Promise<any> {
    // 检查发送者与接收者是否相同
    if (senderId === receiverId) {
      throw new BadRequestException('不能添加自己为好友。');
    }

    // 检查用户是否存在
    const receiver = await this.userModel.findById(receiverId);
    if (!receiver) {
      throw new NotFoundException('接收者用户不存在');
    }

    // 检查是否已经是好友
    const existingRelation = await this.friendRelationModel.findOne({
      user: senderId,
      friend: receiverId,
      status: 'accepted',
    });

    if (existingRelation) {
      throw new ConflictException('该用户已经是您的好友');
    }

    // 检查是否有未处理的请求
    const existingRequest = await this.friendRequestModel.findOne({
      sender: senderId,
      receiver: receiverId,
      status: 'pending',
    });

    if (existingRequest) {
      throw new ConflictException('已有发送给此用户的待处理请求');
    }

    // 创建新的好友请求
    const friendRequest = new this.friendRequestModel({
      sender: senderId,
      receiver: receiverId,
      message,
      status: 'pending',
    });

    // 保存请求
    const newRequest = await friendRequest.save();

    // 获取发送者信息并发送实时通知
    try {
      const senderInfo = (await this.usersService.findOne(
        senderId,
      )) as unknown as UserInfo;

      if (senderInfo) {
        // 准备通知数据
        const notificationData = {
          requestId: (newRequest._id as ObjectId).toString(),
          sender: {
            _id: senderInfo._id.toString(),
            username: senderInfo.username,
            nickname: senderInfo.nickname || senderInfo.username,
            avatar: senderInfo.avatar || '',
          },
          message: message || '',
          createdAt: new Date(),
          status: newRequest.status,
        };

        // 发送WebSocket通知
        this.notificationsGateway.sendFriendRequestNotification(
          receiverId,
          notificationData,
        );
      }
    } catch (error) {
      console.error('发送好友请求通知失败:', error);
      // 通知失败不应影响请求的创建
    }

    return newRequest;
  }

  // 获取收到的好友请求
  // 获取收到的好友请求 (可以考虑添加 status 参数进行筛选)
  async getReceivedFriendRequests(
    userId: string,
    status?: FriendRequestStatus | FriendRequestStatus[],
  ): Promise<any[]> {
    const query: any = { receiver: userId };
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    } else {
      // 默认获取所有状态的，或者只获取 pending，根据你的需求
      // query.status = 'pending'; // 如果只想获取未处理的
    }
    const requests = await this.friendRequestModel
      .find(query)
      .populate('sender', 'username nickname avatar')
      .sort({ createdAt: -1 }) // 按创建时间降序
      .lean();
    return requests;
  }

  // 获取发送的好友请求
  // 获取发送的好友请求 (可以考虑添加 status 参数进行筛选)
  async getSentFriendRequests(
    userId: string,
    status?: FriendRequestStatus | FriendRequestStatus[],
  ): Promise<any[]> {
    const query: any = { sender: userId };
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }
    const requests = await this.friendRequestModel
      .find(query)
      .populate('receiver', 'username nickname avatar')
      .sort({ createdAt: -1 }) // 按创建时间降序
      .lean();
    return requests;
  }

  // 处理好友请求
  async handleFriendRequest(
    userId: string,
    requestId: string,
    action: string,
  ): Promise<any> {
    const request = await this.friendRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('好友请求不存在');
    }

    // 确保只有接收者可以处理请求
    if (request.receiver.toString() !== userId) {
      throw new ForbiddenException('没有权限处理此请求');
    }

    // 确保只能处理 pending 状态的请求，防止重复处理或处理已完成的请求
    if (request.status !== 'pending') {
      throw new BadRequestException(
        `该请求已被处理，当前状态: ${request.status}`,
      );
    }

    // --- 关键检查点 ---
    const newStatus = action as FriendRequestStatus; // 'accepted' or 'rejected'
    if (newStatus !== 'accepted' && newStatus !== 'rejected') {
      // 增加校验
      this.logger.error(`无效的 action 值: ${action}，无法更新 status`);
      throw new BadRequestException(`无效的操作: ${action}`);
    }
    request.status = newStatus;
    this.logger.log(`准备保存请求 ${requestId}，新状态: ${request.status}`); // 添加日志
    // --- 检查点结束 ---

    await request.save(); // 保存更新
    this.logger.log(
      `请求 ${requestId} 已保存，数据库中状态应为: ${request.status}`,
    ); // 确认保存

    // 如果接受请求，创建双向好友关系
    if (action === 'accepted') {
      // 创建正向关系 (user -> friend)
      await this.friendRelationModel.findOneAndUpdate(
        { user: userId, friend: request.sender },
        { status: 'accepted' },
        { upsert: true, new: true },
      );

      // 创建反向关系 (friend -> user)
      await this.friendRelationModel.findOneAndUpdate(
        { user: request.sender, friend: userId },
        { status: 'accepted' },
        { upsert: true, new: true },
      );
    }

    // 发送请求状态更新通知
    try {
      const senderId = request.sender.toString();
      const receiverInfo = (await this.usersService.findOne(
        userId,
      )) as unknown as UserInfo; // 处理请求的人
      if (receiverInfo) {
        this.notificationsGateway.sendFriendRequestUpdateNotification(
          senderId,
          {
            requestId: (request._id as ObjectId).toString(),
            status: (action as 'accepted') || 'rejected', // 'accepted' or 'rejected'
            // 可以选择性地包含处理者信息
            // handler: { _id: receiverInfo._id, nickname: receiverInfo.nickname || receiverInfo.username }
          },
        );
      }
    } catch (error) {
      console.error('发送好友请求状态更新通知失败:', error);
    }

    return { success: true, action, updatedStatus: request.status };
  }

  // 设置好友备注
  async setFriendRemark(
    userId: string,
    friendId: string,
    remark: string,
  ): Promise<any> {
    const relation = await this.friendRelationModel.findOne({
      user: userId,
      friend: friendId,
      status: 'accepted',
    });

    if (!relation) {
      throw new NotFoundException('好友关系不存在');
    }

    relation.remark = remark;
    return await relation.save();
  }

  // 删除好友
  async removeFriend(userId: string, friendId: string): Promise<any> {
    // 删除双向好友关系
    await this.friendRelationModel.deleteOne({
      user: userId,
      friend: friendId,
    });
    await this.friendRelationModel.deleteOne({
      user: friendId,
      friend: userId,
    });

    return { success: true };
  }

  // 获取用户好友的所有分类
  async getFriendCategories(userId: string): Promise<string[]> {
    const relations = await this.friendRelationModel.find({
      user: userId,
      status: 'accepted',
    });

    // 获取不重复的分类列表
    const categories = [
      ...new Set(relations.map((relation) => relation.category)),
    ];
    return categories;
  }

  // 按分类获取好友
  async getFriendsByCategory(userId: string): Promise<any> {
    const relations = await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate(
        'friend',
        'username nickname avatar onlineStatus lastOnlineTime',
      )
      .lean();

    // 按分类分组
    const categorized = {};
    relations.forEach((relation) => {
      const category = relation.category || '我的好友';
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(relation);
    });

    // 转换为数组形式
    return Object.keys(categorized).map((category) => ({
      category,
      friends: categorized[category],
    }));
  }

  // 修改好友分类
  async updateFriendCategory(
    userId: string,
    friendId: string,
    category: string,
  ): Promise<any> {
    const relation = await this.friendRelationModel.findOne({
      user: userId,
      friend: friendId,
      status: 'accepted',
    });

    if (!relation) {
      throw new NotFoundException('好友关系不存在');
    }

    relation.category = category;
    return await relation.save();
  }

  // 创建新分类并移动好友
  async createCategoryAndMoveFriends(
    userId: string,
    category: string,
    friendIds: string[],
  ): Promise<any> {
    // 确认所有好友关系存在
    const validations = await Promise.all(
      friendIds.map((friendId) =>
        this.friendRelationModel.findOne({
          user: userId,
          friend: friendId,
          status: 'accepted',
        }),
      ),
    );

    const invalidFriends = validations.filter((relation) => !relation);
    if (invalidFriends.length > 0) {
      throw new BadRequestException('部分好友关系不存在');
    }

    // 批量更新好友分类
    const updateOperations = friendIds.map((friendId) =>
      this.friendRelationModel.updateOne(
        { user: userId, friend: friendId },
        { category },
      ),
    );

    await Promise.all(updateOperations);
    return { success: true, category, count: friendIds.length };
  }
}
