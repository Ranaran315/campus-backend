import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Document as MongooseDocument } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import {
  UserConversationSetting,
  UserConversationSettingDocument,
} from './schemas/user-conversation-setting.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { FriendsService } from '../friends/friends.service';
import { ChatGroup } from './schemas/chat-group.schema';
// 假设 GroupDocument 和 Group 已经定义在某处，例如 group.schema.ts
// import { Group, GroupDocument } from '../group/schemas/group.schema'; 

// 为了编译通过，如果 GroupDocument 未导入，先做一个临时定义
interface TempGroupDocument extends MongooseDocument {
  _id: Types.ObjectId;
  name: string;
  avatar?: string;
  // ... other group fields
}

interface ConversationParticipant {
  _id: Types.ObjectId;
  username: string;
  nickname?: string;
  avatar?: string;
  email?: string;
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(UserConversationSetting.name)
    private settingModel: Model<UserConversationSettingDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(ChatGroup.name) private chatGroupModel: Model<ChatGroup>,
    @Inject(forwardRef(() => FriendsService))
    private friendsService: FriendsService,
    // 如果GroupModel可用，则注入它以验证群组信息或进行更复杂的填充
    // @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
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
      .populate({ path: 'participants', select: 'username nickname avatar _id email' })
      .populate({
        path: 'group',
        select: 'name avatar',
      })
      .sort({ lastActivityAt: -1 })
      .lean()
      .exec();

    // 获取用户对这些会话的个人设置
    const conversationIds = conversations.map((c) => c._id);
    const settings = await this.settingModel
      .find({
        user: userIdObj,
        conversation: { $in: conversationIds },
      })
      .lean()
      .exec();

    // 获取用户的所有好友关系
    const friends = await this.friendsService.getFriends(userIdObj);
    const friendsMap = new Map(
      friends.map(friend => [
        friend.friend._id.toString(),
        friend
      ])
    );

    // 合并会话信息与个人设置
    const settingsMap = new Map(
      settings.map((s) => [s.conversation.toString(), s]),
    );

    const result = conversations
      .map((conv) => {
        const setting = settingsMap.get(conv._id.toString());
        let displayProfile: any = null;

        if (conv.type === 'private') {
          const otherParticipant = conv.participants.find(
            (p) => !(p._id as Types.ObjectId).equals(userIdObj)
          );
          
          if (otherParticipant && 'username' in otherParticipant) {
            const participant = otherParticipant as ConversationParticipant;
            // 查找是否是好友关系
            const friendInfo = friendsMap.get(participant._id.toString());
            displayProfile = {
              ...participant,
              // 如果是好友且有备注名，使用备注名
              nickname: friendInfo?.remark || participant.nickname || participant.username,
              isFriend: !!friendInfo
            };
          }
        } else if (conv.type === 'group') {
          if (conv.group && typeof conv.group === 'object' && 'name' in conv.group) {
            displayProfile = conv.group;
          } else {
            displayProfile = { name: '群聊', avatar: '' };
          }
        }

        return {
          ...conv,
          isPinned: setting?.isPinned || false,
          isVisible: setting?.isVisible !== false,
          unreadCount: setting?.unreadCount || 0,
          isMuted: setting?.isMuted || false,
          customName: setting?.nickname,
          displayProfile: displayProfile,
        };
      })
      .filter((conv) => conv.isVisible)
      // 置顶的会话优先显示，同一状态下按最后活动时间排序
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        const timeA = a.lastActivityAt instanceof Date ? a.lastActivityAt.getTime() : Date.parse(a.lastActivityAt as any || 0);
        const timeB = b.lastActivityAt instanceof Date ? b.lastActivityAt.getTime() : Date.parse(b.lastActivityAt as any || 0);
        return timeB - timeA;
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

    let conversation = await this.conversationModel
      .findOne({
        type: 'private',
        participants: { $all: [id1, id2], $size: 2 },
        isDeleted: { $ne: true },
      })
      .populate({ path: 'participants', select: 'username nickname avatar _id email' })
      .exec();

    if (conversation) {
      // 会话已存在，确保它对两个用户都可见
      await Promise.all([
        this.ensureConversationIsVisible(id1, conversation._id as Types.ObjectId),
        this.ensureConversationIsVisible(id2, conversation._id as Types.ObjectId),
      ]);
      return conversation;
    }

    const newConversation = new this.conversationModel({
      type: 'private',
      participants: [id1, id2],
      lastActivityAt: new Date(),
    });

    let savedConversation = await newConversation.save();
    savedConversation = await savedConversation.populate({ path: 'participants', select: 'username nickname avatar _id email' });

    // 为两个用户创建会话设置
    await Promise.all([
      this.settingModel.create({
        user: id1, // 确保使用 user 字段
        conversation: savedConversation._id, // 确保使用 conversation 字段
        isVisible: true,
      }),
      this.settingModel.create({
        user: id2, // 确保使用 user 字段
        conversation: savedConversation._id, // 确保使用 conversation 字段
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
        group: groupIdObj, // 确保使用 group 字段
        isDeleted: { $ne: true },
      })
      .exec();

    if (existingConversation) {
      return existingConversation;
    }

    // 创建新的群聊会话
    const newConversation = new this.conversationModel({
      type: 'group',
      group: groupIdObj, // 确保使用 group 字段
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
      { conversation: new Types.ObjectId(conversationId), user: new Types.ObjectId(userId) }, // 使用 user 和 conversation
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
      { conversation: new Types.ObjectId(conversationId), user: new Types.ObjectId(userId) }, // 使用 user 和 conversation
      { unreadCount: 0 },
      { upsert: true },
    );
  }

  // 新增：确保用户的会话设置为可见
  async ensureConversationIsVisible(
    userId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId,
  ) {
    const userIdObj = new Types.ObjectId(userId);
    const conversationIdObj = new Types.ObjectId(conversationId);

    await this.settingModel.findOneAndUpdate(
      { user: userIdObj, conversation: conversationIdObj },
      { isVisible: true },
      { upsert: true, new: true }, // 如果记录不存在则创建，并确保 isVisible 是 true
    );
  }

  // 获取指定会话详情
  async getConversationById(id: string | Types.ObjectId) {
    const conversation = await this.conversationModel
      .findById(id)
      .populate('lastMessage')
      .populate({ path: 'participants', select: 'username nickname avatar _id email' })
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
      { user: new Types.ObjectId(userId), conversation: new Types.ObjectId(conversationId) }, // 使用 user 和 conversation
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
      { user: new Types.ObjectId(userId), conversation: new Types.ObjectId(conversationId) }, // 使用 user 和 conversation
      { isVisible: false },
      { upsert: true, new: true },
    );
  }

  // 获取用户参与的所有群聊ID
  async getUserGroupIds(userId: string | Types.ObjectId): Promise<string[]> {
    const userIdObj = new Types.ObjectId(userId);
    const groupConversations = await this.conversationModel
      .find({
        participants: userIdObj,
        type: 'group',
        isDeleted: { $ne: true },
      })
      .select('group') // 只需要 group 字段，其中包含群组ID
      .lean()
      .exec();

    return groupConversations
      .map(conv => conv.group?.toString()) // 获取群组ID并转换为字符串
      .filter((groupId): groupId is string => !!groupId); // 使用类型守卫确保过滤后是 string[]
  }
}
