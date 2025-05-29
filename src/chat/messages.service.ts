import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { ConversationService } from './conversation.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { transformObjectId } from 'src/utils/transform';
import { ConversationDocument } from './schemas/conversation.schema';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private conversationService: ConversationService,
  ) {}
  
  // 创建新消息
  async createMessage(senderId: string | Types.ObjectId, messageDto: CreateMessageDto) {
    const senderIdObj = new Types.ObjectId(senderId);
    let conversationId = messageDto.conversationId;
    
    // 如果没有提供会话ID，则创建或获取会话
    if (!conversationId) {
      if (messageDto.receiverId) {
        // 私聊
        const conversation = await this.conversationService.getOrCreatePrivateConversation(
          senderId,
          messageDto.receiverId
        );
        // @ts-ignore
        conversationId = transformObjectId(conversation._id);
      } else if (messageDto.groupId) {
        // 群聊
        const conversation = await this.conversationService.getOrCreateGroupConversation(
          messageDto.groupId
        );
        // @ts-ignore
        conversationId = transformObjectId(conversation._id);
      } else {
        throw new BadRequestException('必须提供会话ID、接收者ID或群组ID');
      }
    }
    
    // 创建消息记录
    const newMessage = new this.messageModel({
      sender: senderIdObj,
      conversation: conversationId, // 修改 conversationId -> conversation
      receiver: messageDto.receiverId ? new Types.ObjectId(messageDto.receiverId) : undefined,
      group: messageDto.groupId ? new Types.ObjectId(messageDto.groupId) : undefined, // 修改 groupId -> group
      type: messageDto.type,
      content: messageDto.content,
      attachments: messageDto.attachments,
      readBy: [senderIdObj], // 发送者默认已读
      metadata: messageDto.metadata,
    });
    
    const savedMessage = await newMessage.save();
    
    // 更新会话最后活动时间和最后消息
    await this.conversationService.updateConversationActivity(
      conversationId,
      savedMessage._id
    );
    
    // 获取会话详情以增加所有其他参与者的未读计数
    const conversation = await this.conversationService.getConversationById(conversationId);
    const otherParticipants = conversation.participants.filter(
      p => !p.equals(senderIdObj)
    );
    
    // 更新所有其他参与者的未读计数
    await Promise.all(
      otherParticipants.map(userId => 
        this.conversationService.incrementUnreadCount(conversationId, userId)
      )
    );
    
    return savedMessage;
  }
  
  // 获取会话的消息历史
  async getConversationMessages(
    conversationId: string | Types.ObjectId,
    limit = 20,
    before?: Date | string,
  ) {
    const query: any = { 
      conversation: conversationId, // 修改 conversationId -> conversation
      isDeleted: { $ne: true }
    };
    
    if (before) {
      const beforeDate = typeof before === 'string' ? new Date(before) : before;
      query.createdAt = { $lt: beforeDate };
    }
    
    return this.messageModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username nickname avatar')
      .exec();
  }
  
  // 标记消息已读
  async markMessagesAsRead(
    userId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId
  ) {
    const userIdObj = new Types.ObjectId(userId);
    
    // 查找该会话中未被当前用户阅读的所有消息
    const messages = await this.messageModel.find({
      conversation: conversationId, // 修改 conversationId -> conversation
      readBy: { $ne: userIdObj },
      isDeleted: { $ne: true },
    });
    
    // 为每条消息添加当前用户到已读列表
    await Promise.all(
      messages.map(message => 
        this.messageModel.findByIdAndUpdate(
          message._id,
          { $addToSet: { readBy: userIdObj } }
        )
      )
    );
    
    // 重置该用户在此会话的未读计数
    await this.conversationService.resetUnreadCount(conversationId, userId);
    
    return { markedCount: messages.length };
  }
  
  // 删除消息（软删除）
  async deleteMessage(messageId: string | Types.ObjectId, userId: string | Types.ObjectId) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('消息不存在');
    }
    
    // 只有发送者可以删除消息
    if (!message.sender.equals(new Types.ObjectId(userId))) {
      throw new BadRequestException('只有消息发送者可以删除消息');
    }
    
    message.isDeleted = true;
    return message.save();
  }
  
  // 获取用户的未读消息总数
  async getUnreadMessagesCount(userId: string | Types.ObjectId) {
    const settings = await this.conversationService['settingModel'].find({
      user: userId, // 修改 userId -> user
      isVisible: true,
    });
    
    return settings.reduce((total, setting) => total + (setting.unreadCount || 0), 0);
  }
}