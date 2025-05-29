import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import {
  UserConversationSetting,
  UserConversationSettingDocument,
} from './schemas/user-conversation-setting.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(UserConversationSetting.name)
    private settingModel: Model<UserConversationSettingDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  // 获取用户的所有会话（包括私聊和群聊）
  async getUserConversations(userId: string | Types.ObjectId) {
    const userIdObj = new Types.ObjectId(userId);

    // 查找用户参与的所有会话
    const conversations = await this.conversationModel
      .find({
        participants: userIdObj,
        isDeleted: { $ne: true },
      })
      .populate('lastMessage')
      .sort({ lastActivityAt: -1 })
      .lean()
      .exec();

    // 获取用户对这些会话的个人设置
    const conversationIds = conversations.map((c) => c._id);
    const settings = await this.settingModel
      .find({
        user: userIdObj, // 假设修改了 userId -> user
        conversation: { $in: conversationIds }, // 假设修改了 conversationId -> conversation
      })
      .lean()
      .exec();

    // 合并会话信息与个人设置
    const settingsMap = new Map(
      settings.map((s) => [s.conversation.toString(), s]),
    );

    const result = conversations
      .map((conv) => {
        const setting = settingsMap.get(conv._id.toString());
        return {
          ...conv,
          isPinned: setting?.isPinned || false,
          isVisible: setting?.isVisible !== false, // 默认可见
          unreadCount: setting?.unreadCount || 0,
          isMuted: setting?.isMuted || false,
          customName: setting?.nickname,
        };
      })
      // 过滤掉用户设置为不可见的会话
      .filter((conv) => conv.isVisible)
      // 置顶的会话优先显示
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });

    return result;
  }

  // 获取或创建私聊会话
  async getOrCreatePrivateConversation(
    userId1: string | Types.ObjectId,
    userId2: string | Types.ObjectId,
  ) {
    const id1 = new Types.ObjectId(userId1);
    const id2 = new Types.ObjectId(userId2);

    // 查询是否已存在这两个用户的私聊会话
    const existingConversation = await this.conversationModel
      .findOne({
        type: 'private',
        participants: { $all: [id1, id2], $size: 2 },
        isDeleted: { $ne: true },
      })
      .exec();

    if (existingConversation) {
      return existingConversation;
    }

    // 创建新的私聊会话
    const newConversation = new this.conversationModel({
      type: 'private',
      participants: [id1, id2],
      lastActivityAt: new Date(),
    });

    const savedConversation = await newConversation.save();

    // 为两个用户创建会话设置
    await Promise.all([
      this.settingModel.create({
        user: id1, // 修改 userId -> user
        conversation: savedConversation._id, // 修改 conversationId -> conversation
        isVisible: true,
      }),
      this.settingModel.create({
        user: id2, // 修改 userId -> user
        conversation: savedConversation._id, // 修改 conversationId -> conversation
        isVisible: true,
      }),
    ]);

    return savedConversation;
  }

  // 获取或创建群聊会话
  async getOrCreateGroupConversation(groupId: string | Types.ObjectId) {
    const groupIdObj = new Types.ObjectId(groupId);

    // 查询是否已存在该群的会话
    const existingConversation = await this.conversationModel
      .findOne({
        type: 'group',
        group: groupIdObj, // 假设修改了 groupId -> group
        isDeleted: { $ne: true },
      })
      .exec();

    if (existingConversation) {
      return existingConversation;
    }

    // 创建新的群聊会话
    const newConversation = new this.conversationModel({
      type: 'group',
      group: groupIdObj, // 修改 groupId -> group
      participants: [], // 会在GroupService中更新成员
      lastActivityAt: new Date(),
    });

    return await newConversation.save();
  }

  // 更新会话最后活动时间和最后一条消息
  async updateConversationActivity(
    conversationId: string | Types.ObjectId,
    messageId: string | Types.ObjectId,
  ) {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: messageId,
      lastActivityAt: new Date(),
    });
  }

  // 增加用户的未读消息计数
  async incrementUnreadCount(
    conversationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ) {
    await this.settingModel.findOneAndUpdate(
      { conversation: conversationId, user: userId }, // 修改字段名
      { $inc: { unreadCount: 1 } },
      { upsert: true },
    );
  }

  // 重置未读计数（用户阅读会话时）
  async resetUnreadCount(
    conversationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ) {
    await this.settingModel.findOneAndUpdate(
      { conversation: conversationId, user: userId }, // 修改字段名
      { unreadCount: 0 },
      { upsert: true },
    );
  }

  // 获取指定会话详情
  async getConversationById(id: string | Types.ObjectId) {
    const conversation = await this.conversationModel
      .findById(id)
      .populate('lastMessage')
      .exec();

    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    return conversation;
  }

  // 设置会话是否置顶
  async pinConversation(
    userId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId,
    isPinned: boolean,
  ) {
    return this.settingModel.findOneAndUpdate(
      { user: userId, conversation: conversationId }, // 修改字段名
      { isPinned },
      { upsert: true, new: true },
    );
  }

  // 从会话列表中隐藏会话（不删除实际数据）
  async hideConversation(
    userId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId,
  ) {
    return this.settingModel.findOneAndUpdate(
      { user: userId, conversation: conversationId }, // 修改字段名
      { isVisible: false },
      { upsert: true, new: true },
    );
  }
}
