import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatGroup, ChatGroupDocument } from './schemas/chat-group.schema';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import {
  UserConversationSetting,
  UserConversationSettingDocument,
} from './schemas/user-conversation-setting.schema';
import { ConversationService } from './conversation.service';
import { Message, MessageDocument } from './schemas/message.schema';

// TEMPORARILY SIMPLIFIED FOR DEBUGGING
interface CreateGroupDto {
  name: string;
  description?: string;
  // 'members' field removed here as well
}

@Injectable()
export class GroupService {
  constructor(
    @InjectModel(ChatGroup.name) private groupModel: Model<ChatGroupDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(UserConversationSetting.name)
    private settingModel: Model<UserConversationSettingDocument>,
    private conversationService: ConversationService,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async createGroup(userId: string | Types.ObjectId, createGroupDto: CreateGroupDto) {
    const userIdObj = new Types.ObjectId(userId);

    if (!createGroupDto.name || createGroupDto.name.trim().length === 0) {
      throw new BadRequestException('群名称不能为空');
    }

    // Since DTO.members is removed, initialize members with only the creator
    const memberIds = [userIdObj];

    const groupData = {
      name: createGroupDto.name.trim(),
      description: createGroupDto.description?.trim(),
      maxMembers: 200,
      isPublic: false,
      owner: userIdObj,
      members: memberIds, // Ensure this is an array of ObjectIds
      admins: [userIdObj],
    };

    const group = new this.groupModel(groupData);
    const savedGroup: any = await group.save(); // Temporarily using any to bypass linter for _id

    const conversation = await this.conversationService.getOrCreateGroupConversation(
      savedGroup._id.toString(), 
    );

    return {
      group: savedGroup,
      conversation,
    };
  }

  // 获取群组详情
  async getGroupById(groupId: string | Types.ObjectId, includeMembers = true): Promise<ChatGroupDocument | null> {
    const basePopulate = [
      { path: 'owner', select: 'username nickname avatar' },
      { path: 'admins', select: 'username nickname avatar' },
    ];

    if (includeMembers) {
      basePopulate.push({ path: 'members', select: 'username nickname avatar' });
    }

    const group = await this.groupModel
      .findById(groupId)
      .populate(basePopulate)
      .exec();

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    return group;
  }

  // 新增：获取群成员列表
  async getGroupMembers(
    groupId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    search?: string,
  ) {
    const group = await this.groupModel
      .findById(groupId)
      .populate([
        { path: 'owner', select: 'username nickname avatar' },
        { path: 'admins', select: 'username nickname avatar' },
        { path: 'members', select: 'username nickname avatar' },
      ])
      .exec();

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    // 验证请求用户是否为群成员
    const userIdObj = new Types.ObjectId(userId);
    if (!group.members.some(m => (m as any)._id.equals(userIdObj))) {
      throw new ForbiddenException('您不是该群组的成员');
    }

    let members = group.members;
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter((member: any) => {
        const username = member.username.toLowerCase();
        const nickname = member.nickname?.toLowerCase() || '';
        return username.includes(searchLower) || nickname.includes(searchLower);
      });
    }

    // 为每个成员添加角色信息
    const membersWithRoles = members.map((member: any) => {
      const isOwner = group.owner._id.equals(member._id);
      const isAdmin = group.admins.some((admin: any) => admin._id.equals(member._id));
      
      return {
        ...member.toObject(),
        role: isOwner ? 'owner' : (isAdmin ? 'admin' : 'member')
      };
    });

    return {
      total: group.members.length,
      members: membersWithRoles,
    };
  }

  // 获取用户加入的所有群组
  async getUserGroups(userId: string | Types.ObjectId) {
    return this.groupModel
      .find({
        members: new Types.ObjectId(userId),
        isDeleted: { $ne: true },
      })
      .populate('owner', 'username nickname avatar')
      .exec();
  }

  // 更新群头像
  async updateGroupAvatar(groupId: string | Types.ObjectId, avatarUrl: string) {
    const group = await this.groupModel.findById(groupId);
    if (!group) {
      throw new NotFoundException('群组不存在 (updateGroupAvatar)');
    }

    group.avatar = avatarUrl;
    return await group.save();
  }

  // 更新群组基本信息 (名称, 描述等)
  async updateGroup(groupId: string | Types.ObjectId, updateData: Partial<Pick<ChatGroup, 'name' | 'description'>>) {
    const group = await this.groupModel.findById(groupId);
    if (!group) {
      throw new NotFoundException('群组不存在 (updateGroup)');
    }

    // Update allowed fields
    if (updateData.name !== undefined) {
      group.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      group.description = updateData.description.trim();
    }
    // Add other updatable fields here if necessary, e.g., group.isPublic

    return await group.save();
  }

  // 添加成员到群组（修改方法名以匹配控制器中的调用）
  async addGroupMember(
    groupId: string | Types.ObjectId,
    operatorId: string | Types.ObjectId,
    memberId: string | Types.ObjectId,
  ) {
    const group = await this.groupModel.findById(groupId);
    if (!group) {
      throw new BadRequestException('群组不存在');
    }

    const operatorIdObj = new Types.ObjectId(operatorId);
    const memberIdObj = new Types.ObjectId(memberId);

    // 检查操作者权限（群主或管理员）
    const isAuthorized =
      group.owner.equals(operatorIdObj) ||
      group.admins.some((id) => id.equals(operatorIdObj));

    if (!isAuthorized) {
      throw new ForbiddenException('没有权限执行此操作');
    }

    // 检查是否已经是成员
    if (group.members.some(id => id.equals(memberIdObj))) {
      throw new BadRequestException('用户已经是群成员');
    }

    // 检查是否达到人数上限
    if (group.members.length >= group.maxMembers) {
      throw new BadRequestException('群成员已达到上限');
    }

    // 添加成员
    group.members.push(memberIdObj);
    await group.save();

    // 更新会话参与者
    const conversation = await this.conversationModel.findOne({
      group: new Types.ObjectId(groupId),
    });

    if (conversation) {
      // 添加到会话参与者列表
      if (!conversation.participants.some(id => id.equals(memberIdObj))) {
        conversation.participants.push(memberIdObj);
        await conversation.save();
      }

      // 更新或创建会话设置
      await this.settingModel.findOneAndUpdate(
        {
          user: memberIdObj,
          conversation: conversation._id,
        },
        {
          $set: {
            isVisible: true,
            unreadCount: 0,
          }
        },
        {
          upsert: true,
          new: true,
        }
      );
    }

    return group;
  }

  // 移除群组成员
  async removeGroupMember(
    groupId: string | Types.ObjectId,
    operatorId: string | Types.ObjectId,
    memberId: string | Types.ObjectId,
  ) {
    const group = await this.groupModel.findById(groupId);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    const memberIdObj = new Types.ObjectId(memberId);
    const operatorIdObj = new Types.ObjectId(operatorId);

    // 群主不能被移除
    if (group.owner.equals(memberIdObj)) {
      throw new BadRequestException('群主不能被移出群组');
    }

    // 检查操作者权限（群主、管理员或自己退出）
    const isSelfLeaving = operatorIdObj.equals(memberIdObj);
    const isAuthorized =
      group.owner.equals(operatorIdObj) ||
      group.admins.some((id) => id.equals(operatorIdObj)) ||
      isSelfLeaving;

    if (!isAuthorized) {
      throw new ForbiddenException('没有权限执行此操作');
    }

    // 更新群组成员
    group.members = group.members.filter((id) => !id.equals(memberIdObj));

    // 如果是管理员，也要从管理员列表移除
    group.admins = group.admins.filter((id) => !id.equals(memberIdObj));

    await group.save();

    // 更新会话参与者
    const conversation = await this.conversationModel.findOne({
      group: new Types.ObjectId(groupId),
    });
    
    if (conversation) {
      // 从会话参与者列表中移除
      conversation.participants = conversation.participants.filter(
        (id) => !id.equals(memberIdObj),
      );
      await conversation.save();

      // 删除该成员的会话设置
      await this.settingModel.deleteOne({
        user: memberIdObj,
        conversation: conversation._id,
      });
    }

    return group;
  }

  // 设置/移除群管理员
  async toggleGroupAdmin(
    groupId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    isAdmin: boolean,
  ) {
    const group = await this.groupModel.findById(groupId);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    // 只有群主可以设置管理员
    if (!group.owner.equals(new Types.ObjectId(ownerId))) {
      throw new ForbiddenException('只有群主可以管理管理员');
    }

    const userIdObj = new Types.ObjectId(userId);

    // 检查用户是否为群成员
    if (!group.members.some((id) => id.equals(userIdObj))) {
      throw new BadRequestException('该用户不是群组成员');
    }

    if (isAdmin) {
      // 添加为管理员
      if (!group.admins.some((id) => id.equals(userIdObj))) {
        group.admins.push(userIdObj);
      }
    } else {
      // 移除管理员
      group.admins = group.admins.filter((id) => !id.equals(userIdObj));
    }

    return group.save();
  }

  // 解散群组（只有群主可以）
  async disbandGroup(
    groupId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
  ) {
    const group = await this.groupModel.findById(groupId);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    // 只有群主可以解散群组
    if (!group.owner.equals(new Types.ObjectId(ownerId))) {
      throw new ForbiddenException('只有群主可以解散群组');
    }

    // 查找对应的会话
    const conversation = await this.conversationModel.findOne({ 
      group: new Types.ObjectId(groupId) 
    });

    if (conversation) {
      // 删除所有相关消息
      await this.messageModel.deleteMany(
        { conversation: conversation._id }
      );

      // 删除所有会话设置
      await this.settingModel.deleteMany(
        { conversation: conversation._id }
      );

      // 删除会话
      await this.conversationModel.findByIdAndDelete(conversation._id);
    }

    // 删除群组
    await this.groupModel.findByIdAndDelete(groupId);

    return { success: true };
  }
}
