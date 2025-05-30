import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { ConversationService } from './conversation.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { transformObjectId } from 'src/utils/transform';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private conversationService: ConversationService,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
  ) {}

  // 创建新消息
  async createMessage(
    senderId: string | Types.ObjectId,
    messageDto: CreateMessageDto,
  ) {
    const senderIdObj = new Types.ObjectId(senderId);
    let conversationObjectId: Types.ObjectId;

    // 如果没有提供会话ID，则创建或获取会话
    if (messageDto.conversationId) {
      conversationObjectId = new Types.ObjectId(messageDto.conversationId);
    } else if (messageDto.receiver) {
      // 私聊
      const conversation = await this.conversationService.getOrCreatePrivateConversation(
        senderId,
        messageDto.receiver,
      );
      conversationObjectId = conversation._id as Types.ObjectId;
    } else if (messageDto.group) {
      // 群聊
      const conversation = await this.conversationService.getOrCreateGroupConversation(
        messageDto.group,
      );
      conversationObjectId = conversation._id as Types.ObjectId;
    } else {
      throw new BadRequestException('必须提供会话ID、接收者ID或群组ID');
    }

    // 创建消息记录
    const newMessage = new this.messageModel({
      sender: senderIdObj,
      conversation: conversationObjectId, // 使用 conversationObjectId
      receiver: messageDto.receiver
        ? new Types.ObjectId(messageDto.receiver)
        : undefined,
      group: messageDto.group
        ? new Types.ObjectId(messageDto.group)
        : undefined,
      type: messageDto.type,
      content: messageDto.content,
      attachments: messageDto.attachments,
      readBy: [senderIdObj], // 发送者默认已读
      metadata: messageDto.metadata,
    });

    const savedMessage = await newMessage.save();

    // 更新会话最后活动时间和最后消息
    await this.conversationService.updateConversationActivity(
      conversationObjectId,
      savedMessage._id as Types.ObjectId,
    );

    // 获取会话详情以进行后续操作
    const conversationDetails = await this.conversationService.getConversationById(conversationObjectId);
    
    // 确保会话对所有参与者都可见
    const allParticipantIds: Types.ObjectId[] = conversationDetails.participants.map(p => p._id as Types.ObjectId);
    // 理论上发送者 senderIdObj 应该已经在 conversationDetails.participants 中了，
    // 但为了绝对保险，可以检查并添加（如果会话参与者逻辑复杂或可能不包含发送者）
    // if (!allParticipantIds.some(id => id.equals(senderIdObj))) {
    //   allParticipantIds.push(senderIdObj);
    // }
    // 实际上，新创建的会话或者通过 getOrCreate 获取的会话，其 participants 列表是权威的。
    // 对于私聊，getOrCreatePrivateConversation 保证双方都在 participants 中。
    // 对于群聊，participants 由群成员逻辑维护。发送者如果是群成员，应该在里面。

    await Promise.all(
      allParticipantIds.map((participantId) =>
        this.conversationService.ensureConversationIsVisible(participantId, conversationObjectId),
      ),
    );

    // 更新所有 *其他* 除去发送者外的参与者的未读计数
    const otherParticipantsForUnread = conversationDetails.participants.filter(
      (p) => !(p._id as Types.ObjectId).equals(senderIdObj),
    );

    await Promise.all(
      otherParticipantsForUnread.map((participant) => // participant 是完整的对象
        this.conversationService.incrementUnreadCount(conversationObjectId, participant._id as Types.ObjectId), // 使用 participant._id
      ),
    );

    // 将消息通过 WebSocket 推送给相关客户端
    if (savedMessage.receiver) { // 私聊
      this.notificationsGateway.sendMessageToUser(savedMessage.receiver.toString(), savedMessage);
    } else if (savedMessage.group) { // 群聊
      this.notificationsGateway.broadcastMessageToGroup(savedMessage.group.toString(), savedMessage);
    }

    return savedMessage;
  }

  // 获取会话的消息历史
  async getConversationMessages(
    conversationId: string | Types.ObjectId,
    limit = 20,
    before?: Date | string,
  ) {
    const query: any = {
      conversation: new Types.ObjectId(conversationId), // 使用 conversation
      isDeleted: { $ne: true },
    };

    if (before) {
      const beforeDate = typeof before === 'string' ? new Date(before) : before;
      query.createdAt = { $lt: beforeDate };
    }

    return this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username nickname avatar')
      .exec();
  }

  // 标记消息已读
  async markMessagesAsRead(
    userId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId,
  ) {
    const userIdObj = new Types.ObjectId(userId);

    // 查找该会话中未被当前用户阅读的所有消息
    const messages = await this.messageModel.find({
      conversation: new Types.ObjectId(conversationId), // 使用 conversation
      readBy: { $ne: userIdObj },
      isDeleted: { $ne: true },
    });

    // 为每条消息添加当前用户到已读列表
    await Promise.all(
      messages.map((message) =>
        this.messageModel.findByIdAndUpdate(message._id, {
          $addToSet: { readBy: userIdObj },
        }),
      ),
    );

    // 重置该用户在此会话的未读计数
    await this.conversationService.resetUnreadCount(conversationId, userId);

    return { markedCount: messages.length };
  }

  // 删除消息（软删除）
  async deleteMessage(
    messageId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ) {
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
      user: new Types.ObjectId(userId), // 确保使用 user 字段
      isVisible: true,
    });

    return settings.reduce(
      (total, setting) => total + (setting.unreadCount || 0),
      0,
    );
  }
}
