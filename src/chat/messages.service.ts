import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
  Logger,
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

  private readonly logger = new Logger(MessageService.name);

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
      const conversation = await this.conversationService.getOrCreatePrivateConversation(
        senderId,
        messageDto.receiver,
      );
      conversationObjectId = conversation._id as Types.ObjectId;
    } else if (messageDto.group) {
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
      conversation: conversationObjectId,
      receiver: messageDto.receiver
        ? new Types.ObjectId(messageDto.receiver)
        : undefined,
      group: messageDto.group
        ? new Types.ObjectId(messageDto.group)
        : undefined,
      type: messageDto.type,
      content: messageDto.content,
      attachments: messageDto.attachments,
      readBy: [senderIdObj],
      metadata: messageDto.metadata,
    });

    const savedMessage = await newMessage.save();

    // 更新会话最后活动时间和最后消息
    await this.conversationService.updateConversationActivity(
      conversationObjectId,
      savedMessage._id as Types.ObjectId,
    );

    // 获取会话详情以进行后续操作
    const conversationDetails = await this.conversationService.getConversationById(conversationObjectId.toString());
    
    // 确保会话对所有参与者都可见
    if (conversationDetails && conversationDetails.participants) {
      const allParticipantIds: Types.ObjectId[] = conversationDetails.participants.map(p => new Types.ObjectId(p._id));
      await Promise.all(
        allParticipantIds.map((participantId) =>
          this.conversationService.ensureConversationIsVisible(participantId, conversationObjectId),
        ),
      );

      // 更新所有 *其他* 除去发送者外的参与者的未读计数
      const otherParticipantsForUnread = conversationDetails.participants.filter(
        (p) => !(new Types.ObjectId(p._id)).equals(senderIdObj),
      );

      await Promise.all(
        otherParticipantsForUnread.map((participant) =>
          this.conversationService.incrementUnreadCount(conversationObjectId, new Types.ObjectId(participant._id)),
        ),
      );
    } else {
      console.error(`Conversation details or participants not found for ${conversationObjectId}, skipping visibility/unread updates.`);
    }

    // 重新获取并填充消息，以便发送更丰富的数据
    const populatedMessage = await this.messageModel.findById(savedMessage._id)
        .populate('sender', 'username realname nickname avatar')
        .exec();
    
    this.logger.debug(`[MessageService] Populated message: ${JSON.stringify(populatedMessage)}`);

    if (!populatedMessage) {
      this.logger.error(`[MessageService] Failed to re-fetch message ${savedMessage._id} for WebSocket push.`);
      // console.error(`[MessageService] Failed to re-fetch message ${savedMessage._id} for WebSocket push.`); // Alternative if logger not fully set up
      // Decide whether to return savedMessage or throw an error
    } else if (conversationDetails && conversationDetails.participants) {
      this.logger.debug(`[MessageService] Pushing message ${populatedMessage._id} via WebSocket. Conversation type: ${conversationDetails.type}, Details: ${JSON.stringify(conversationDetails)}`);

      if (conversationDetails.type === 'private') {
        const recipient = conversationDetails.participants.find(
            p => !(new Types.ObjectId(p._id)).equals(senderIdObj)
        );
        if (recipient) {
          this.logger.debug(`[MessageService] Sending private message to recipient ${recipient._id.toString()}`);
          this.notificationsGateway.sendMessageToUser(recipient._id.toString(), populatedMessage);

          // Send the message back to the sender as well for UI update
          // Ensure sender is not the same as recipient (usually true for private chats)
          if (senderIdObj.toString() !== recipient._id.toString()) {
              this.logger.debug(`[MessageService] Sending private message copy back to sender ${senderIdObj.toString()}`);
              this.notificationsGateway.sendMessageToUser(senderIdObj.toString(), populatedMessage);
          }
        } else {
          this.logger.warn(`[MessageService] Private chat recipient not found for message ${populatedMessage._id} in conversation ${conversationObjectId}`);
        }
      } else if (conversationDetails.type === 'group') {
        let targetGroupId: string | undefined = undefined;
        if (conversationDetails.group && conversationDetails.group.toString) {
            targetGroupId = conversationDetails.group.toString();
        } else if (messageDto.group) { 
            targetGroupId = messageDto.group.toString();
        }
        // Add any other logic to determine targetGroupId if necessary

        if (targetGroupId) {
          this.logger.debug(`[MessageService] Broadcasting group message to group ${targetGroupId}`);
          this.notificationsGateway.broadcastMessageToGroup(targetGroupId, populatedMessage);
        } else {
          this.logger.warn(`[MessageService] Group ID not found for group message ${populatedMessage._id} in conversation ${conversationObjectId}. Cannot broadcast.`);
        }
      } else {
        this.logger.warn(`[MessageService] Unknown conversation type: ${conversationDetails.type} for message ${populatedMessage._id}. Cannot determine WebSocket push strategy.`);
      }
    }
    // --- End WebSocket push logic ---

    return savedMessage; // Or populatedMessage, depending on API contract
  }

  // 获取会话的消息历史
  async getConversationMessages(
    conversationId: string | Types.ObjectId,
    currentUserId: string | Types.ObjectId,
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

    const currentUserIdObj = new Types.ObjectId(currentUserId);

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username nickname avatar _id') // 确保 _id 在 sender 中
      .lean() // 使用 lean() 获取普通 JS 对象，方便添加属性
      .exec();

    // 为每条消息添加 isSent 字段
    return messages.map((message) => {
      // 注意：populate 后的 sender 是一个对象
      const senderId = message.sender && (message.sender as any)._id 
        ? new Types.ObjectId((message.sender as any)._id) 
        : null;
      
      return {
        ...message,
        isSent: senderId ? senderId.equals(currentUserIdObj) : false,
      };
    });
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
