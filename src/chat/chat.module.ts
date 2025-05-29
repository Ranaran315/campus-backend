import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './schemas/message.schema';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import {
  UserConversationSetting,
  UserConversationSettingSchema,
} from './schemas/user-conversation-setting.schema';
import { ChatGroup, ChatGroupSchema } from './schemas/chat-group.schema';
import { MessageService } from './messages.service';
import { ConversationService } from './conversation.service';
import { GroupService } from './group.service';
import { ChatController } from './chat.controller';
import { UsersModule } from '../users/users.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
      {
        name: UserConversationSetting.name,
        schema: UserConversationSettingSchema,
      },
      { name: ChatGroup.name, schema: ChatGroupSchema },
    ]),
    UsersModule, // 引入用户模块以访问用户服务
  ],
  providers: [MessageService, ConversationService, GroupService, ChatGateway],
  controllers: [ChatController],
  exports: [MessageService, ConversationService, GroupService],
})
export class ChatModule {}
