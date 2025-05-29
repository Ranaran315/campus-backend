import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatGroup, ChatGroupDocument } from './schemas/chat-group.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { UserConversationSetting, UserConversationSettingDocument } from './schemas/user-conversation-setting.schema';

@Injectable()
export class GroupService {
  constructor(
    @InjectModel(ChatGroup.name) private groupModel: Model<ChatGroupDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(UserConversationSetting.name) private settingModel: Model<UserConversationSettingDocument>,
  ) {}
  
  // 创建新群组
  async createGroup(ownerId: string | Types.ObjectId, data: {
    name: string;
    description?: string;
    avatar?: string;
    members: string[];
  }) {
    const ownerIdObj = new Types.ObjectId(ownerId);
    
    // 确保创建者在成员列表中
    if (!data.members.some(id => id === ownerId.toString())) {
      data.members.push(ownerId.toString());
    }
    
    // 创建群组
    const newGroup = new this.groupModel({
      name: data.name,
      description: data.description,
      avatar: data.avatar,
      owner: ownerIdObj,
      members: data.members.map(id => new Types.ObjectId(id)),
      admins: [ownerIdObj], // 创建者默认为管理员
    });
    
    const savedGroup = await newGroup.save();
    
    // 创建对应的会话
    const newConversation = new this.conversationModel({
      type: 'group',
      participants: savedGroup.members,
      group: savedGroup._id, // 修改 groupId -> group
      lastActivityAt: new Date(),
    });
    
    const savedConversation = await newConversation.save();
    
    // 为所有成员创建会话设置
    await Promise.all(
      savedGroup.members.map(memberId => 
        this.settingModel.create({
          user: memberId, // 修改 userId -> user
          conversation: savedConversation._id, // 修改 conversationId -> conversation
          isVisible: true,
        })
      )
    );
    
    return {
      group: savedGroup,
      conversation: savedConversation,
    };
  }
  
  // 获取群组详情
  async getGroupById(groupId: string | Types.ObjectId) {
    const group = await this.groupModel.findById(groupId)
      .populate('owner', 'username nickname avatar')
      .populate('members', 'username nickname avatar')
      .populate('admins', 'username nickname avatar')
      .exec();
      
    if (!group) {
      throw new NotFoundException('群组不存在');
    }
    
    return group;
  }
  
  // 获取用户加入的所有群组
  async getUserGroups(userId: string | Types.ObjectId) {
    return this.groupModel.find({
      members: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    })
    .populate('owner', 'username nickname avatar')
    .exec();
  }
  
  // 添加成员到群组
  async addGroupMember(
    groupId: string | Types.ObjectId,
    operatorId: string | Types.ObjectId,
    memberId: string | Types.ObjectId
  ) {
    const group = await this.groupModel.findById(groupId);
    
    if (!group) {
      throw new NotFoundException('群组不存在');
    }
    
    // 检查操作者权限（群主或管理员）
    const operatorIdObj = new Types.ObjectId(operatorId);
    const isAuthorized = group.owner.equals(operatorIdObj) || 
                        group.admins.some(id => id.equals(operatorIdObj));
                        
    if (!isAuthorized) {
      throw new ForbiddenException('没有权限执行此操作');
    }
    
    // 检查成员人数上限
    if (group.members.length >= group.maxMembers) {
      throw new BadRequestException('群组已达到成员上限');
    }
    
    const memberIdObj = new Types.ObjectId(memberId);
    
    // 检查是否已经是成员
    if (group.members.some(id => id.equals(memberIdObj))) {
      throw new BadRequestException('用户已经是群组成员');
    }
    
    // 添加成员到群组
    group.members.push(memberIdObj);
    await group.save();
    
    // 更新会话参与者
    const conversation = await this.conversationModel.findOne({ group: groupId }); // 修改 groupId -> group
    if (conversation) {
      conversation.participants.push(memberIdObj);
      await conversation.save();
      
      // 为新成员创建会话设置
      await this.settingModel.create({
        user: memberIdObj, // 修改 userId -> user
        conversation: conversation._id, // 修改 conversationId -> conversation
        isVisible: true,
      });
    }
    
    return group;
  }
  
  // 移除群组成员
  async removeGroupMember(
    groupId: string | Types.ObjectId,
    operatorId: string | Types.ObjectId,
    memberId: string | Types.ObjectId
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
    const isAuthorized = group.owner.equals(operatorIdObj) || 
                        group.admins.some(id => id.equals(operatorIdObj)) ||
                        isSelfLeaving;
                        
    if (!isAuthorized) {
      throw new ForbiddenException('没有权限执行此操作');
    }
    
    // 更新群组成员
    group.members = group.members.filter(id => !id.equals(memberIdObj));
    
    // 如果是管理员，也要从管理员列表移除
    group.admins = group.admins.filter(id => !id.equals(memberIdObj));
    
    await group.save();
    
    // 更新会话参与者
    const conversation = await this.conversationModel.findOne({ group: groupId }); // 修改 groupId -> group
    if (conversation) {
      conversation.participants = conversation.participants.filter(
        id => !id.equals(memberIdObj)
      );
      await conversation.save();
      
      // 隐藏该成员的会话
      await this.settingModel.findOneAndUpdate(
        { user: memberIdObj, conversation: conversation._id }, // 修改字段名
        { isVisible: false }
      );
    }
    
    return group;
  }
  
  // 设置/移除群管理员
  async toggleGroupAdmin(
    groupId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    isAdmin: boolean
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
    if (!group.members.some(id => id.equals(userIdObj))) {
      throw new BadRequestException('该用户不是群组成员');
    }
    
    if (isAdmin) {
      // 添加为管理员
      if (!group.admins.some(id => id.equals(userIdObj))) {
        group.admins.push(userIdObj);
      }
    } else {
      // 移除管理员
      group.admins = group.admins.filter(id => !id.equals(userIdObj));
    }
    
    return group.save();
  }
  
  // 解散群组（只有群主可以）
  async disbandGroup(groupId: string | Types.ObjectId, ownerId: string | Types.ObjectId) {
    const group = await this.groupModel.findById(groupId);
    
    if (!group) {
      throw new NotFoundException('群组不存在');
    }
    
    // 只有群主可以解散群组
    if (!group.owner.equals(new Types.ObjectId(ownerId))) {
      throw new ForbiddenException('只有群主可以解散群组');
    }
    
    // 软删除群组
    group.isDeleted = true;
    await group.save();
    
    // 软删除对应的会话
    await this.conversationModel.findOneAndUpdate(
      { group: groupId }, // 修改 groupId -> group
      { isDeleted: true }
    );
    
    return { success: true };
  }
}