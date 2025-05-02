import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/users/user.schema';
import { FriendRequest, FriendRequestDocument } from './friendRequest.schema';
import { FriendRelation, FriendRelationDocument } from './friends.schema';
import * as pinyin from 'pinyin'; // 用于处理中文拼音首字母

// friends.service.ts
@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(FriendRelation.name) private friendRelationModel: Model<FriendRelationDocument>,
    @InjectModel(FriendRequest.name) private friendRequestModel: Model<FriendRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // 获取用户的好友列表
  async getFriends(userId: string): Promise<any[]> {
    const friends = await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate('friend', 'username nickname avatar onlineStatus lastOnlineTime')
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
    const friendsWithSortName = relations.map(relation => {
      const friend = relation.friend as any; // 已通过populate填充
      const displayName = relation.remark || friend.nickname || friend.username;
      
      // 获取用于排序的首字母（可以使用第三方库如 pinyin 处理中文）
      const sortLetter = this.getFirstLetter(displayName);
      
      return {
        ...relation,
        friend,
        displayName,
        sortLetter
      };
    });
  
    // 3. 按首字母排序
    friendsWithSortName.sort((a, b) => a.sortLetter.localeCompare(b.sortLetter));
  
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
    const result = Object.keys(groupedFriends).sort().map(letter => ({
      letter,
      friends: groupedFriends[letter]
    }));
  
    return result;
  }

  // 获取字符串的首字母（简单版，实际应考虑中文拼音）
  private getFirstLetter(str: string): string {
    if (!str || str.length === 0) return '#';

    // 对中文字符获取拼音首字母
    const pinyinResult = pinyin(str.charAt(0), {
      style: pinyin.STYLE_FIRST_LETTER
    });
    
    const first = str.charAt(0).toUpperCase();
    // 字母返回自身，非字母返回#
    return /[A-Z]/.test(first) ? first : '#';
  }

  // 发送好友请求
  async sendFriendRequest(senderId: string, receiverId: string, message?: string): Promise<any> {
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

    return await friendRequest.save();
  }

  // 获取收到的好友请求
  async getReceivedFriendRequests(userId: string): Promise<any[]> {
    return this.friendRequestModel
      .find({ receiver: userId, status: 'pending' })
      .populate('sender', 'username nickname avatar')
      .sort({ createdAt: -1 })
      .lean();
  }

  // 获取发送的好友请求
  async getSentFriendRequests(userId: string): Promise<any[]> {
    return this.friendRequestModel
      .find({ sender: userId })
      .populate('receiver', 'username nickname avatar')
      .sort({ createdAt: -1 })
      .lean();
  }

  // 处理好友请求
  async handleFriendRequest(userId: string, requestId: string, action: string): Promise<any> {
    const request = await this.friendRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('好友请求不存在');
    }

    // 确保只有接收者可以处理请求
    if (request.receiver.toString() !== userId) {
      throw new ForbiddenException('没有权限处理此请求');
    }

    // 更新请求状态
    request.status = action;
    await request.save();

    // 如果接受请求，创建双向好友关系
    if (action === 'accept') {
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

    return { success: true, action };
  }

  // 设置好友备注
  async setFriendRemark(userId: string, friendId: string, remark: string): Promise<any> {
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
    await this.friendRelationModel.deleteOne({ user: userId, friend: friendId });
    await this.friendRelationModel.deleteOne({ user: friendId, friend: userId });

    return { success: true };
  }
}
