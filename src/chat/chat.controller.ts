import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Delete,
  Put,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageService } from './messages.service';
import { ConversationService } from './conversation.service';
import { GroupService } from './group.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AuthenticatedUser } from '../auth/types';
import { Types } from 'mongoose';
import { transformObjectId } from '../utils/transform';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private messageService: MessageService,
    private conversationService: ConversationService,
    private groupService: GroupService,
  ) {}
  
  // === 会话相关接口 ===
  
  @Get('conversations')
  async getUserConversations(@Request() req) {
    const user = req.user as AuthenticatedUser;
    this.logger.log(`用户 ${user._id} 获取会话列表`);
    return this.conversationService.getUserConversations(user._id);
  }
  
  @Get('conversations/:id')
  async getConversationById(@Request() req, @Param('id') id: string) {
    const user = req.user as AuthenticatedUser;
    const conversation = await this.conversationService.getConversationById(id);
    
    // 验证用户是否为会话参与者
    if (!conversation.participants.some(p => p.equals(transformObjectId(user._id)))) {
      throw new ForbiddenException('您不是该会话的参与者');
    }
    
    return conversation;
  }
  
  @Post('conversations/private')
  async createPrivateConversation(
    @Request() req,
    @Body('targetUserId') targetUserId: string
  ) {
    const user = req.user as AuthenticatedUser;
    
    if (!targetUserId) {
      throw new BadRequestException('必须提供目标用户ID');
    }
    
    return this.conversationService.getOrCreatePrivateConversation(user._id, targetUserId);
  }
  
  @Put('conversations/:id/pin')
  async pinConversation(
    @Request() req,
    @Param('id') conversationId: string,
    @Body('isPinned') isPinned: boolean
  ) {
    const user = req.user as AuthenticatedUser;
    return this.conversationService.pinConversation(user._id, conversationId, isPinned);
  }
  
  @Delete('conversations/:id')
  async hideConversation(@Request() req, @Param('id') conversationId: string) {
    const user = req.user as AuthenticatedUser;
    return this.conversationService.hideConversation(user._id, conversationId);
  }
  
  // === 消息相关接口 ===
  
  @Get('conversations/:id/messages')
  async getConversationMessages(
    @Request() req,
    @Param('id') conversationId: string,
    @Query('limit') limit = '20',
    @Query('before') before?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const conversation = await this.conversationService.getConversationById(conversationId);
    
    // 验证用户是否为会话参与者
    if (!conversation.participants.some(p => p.equals(transformObjectId(user._id)))) {
      throw new ForbiddenException('您不是该会话的参与者');
    }
    
    return this.messageService.getConversationMessages(
      conversationId,
      parseInt(limit, 10),
      before,
    );
  }
  
  @Post('messages')
  async sendMessage(@Request() req, @Body() messageDto: CreateMessageDto) {
    const user = req.user as AuthenticatedUser;
    
    // 如果提供了会话ID，验证用户是否为会话参与者
    if (messageDto.conversationId) {
      const conversation = await this.conversationService.getConversationById(messageDto.conversationId);
      if (!conversation.participants.some(p => p.equals(transformObjectId(user._id)))) {
        throw new ForbiddenException('您不是该会话的参与者');
      }
    }
    
    // 如果提供了群组ID，验证用户是否为群成员
    if (messageDto.group) {
      const group = await this.groupService.getGroupById(messageDto.group);
      if (!group.members.some(m => m.equals(transformObjectId(user._id)))) {
        throw new ForbiddenException('您不是该群组的成员');
      }
    }
    
    return this.messageService.createMessage(user._id, messageDto);
  }
  
  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markConversationAsRead(@Request() req, @Param('id') conversationId: string) {
    const user = req.user as AuthenticatedUser;
    return this.messageService.markMessagesAsRead(user._id, conversationId);
  }
  
  @Get('messages/unread/count')
  async getUnreadMessagesCount(@Request() req) {
    const user = req.user as AuthenticatedUser;
    const count = await this.messageService.getUnreadMessagesCount(user._id);
    return { count };
  }
  
  @Delete('messages/:id')
  async deleteMessage(@Request() req, @Param('id') messageId: string) {
    const user = req.user as AuthenticatedUser;
    return this.messageService.deleteMessage(messageId, user._id);
  }
  
  // === 群组相关接口 ===
  
  @Post('groups')
  async createGroup(@Request() req, @Body() groupDto: CreateGroupDto) {
    const user = req.user as AuthenticatedUser;
    return this.groupService.createGroup(user._id, groupDto);
  }
  
  @Get('groups/:id')
  async getGroupDetails(@Request() req, @Param('id') groupId: string) {
    const user = req.user as AuthenticatedUser;
    const group = await this.groupService.getGroupById(groupId);
    
    // 验证用户是否为群成员
    if (!group.members.some(m => m.equals(transformObjectId(user._id)))) {
      throw new ForbiddenException('您不是该群组的成员');
    }
    
    return group;
  }
  
  @Get('groups')
  async getUserGroups(@Request() req) {
    const user = req.user as AuthenticatedUser;
    return this.groupService.getUserGroups(user._id);
  }
  
  @Post('groups/:id/members')
  async addGroupMember(
    @Request() req,
    @Param('id') groupId: string,
    @Body('userId') userId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    
    if (!userId) {
      throw new BadRequestException('必须提供要添加的用户ID');
    }
    
    return this.groupService.addGroupMember(groupId, user._id, userId);
  }
  
  @Delete('groups/:id/members/:userId')
  async removeGroupMember(
    @Request() req,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.groupService.removeGroupMember(groupId, user._id, userId);
  }
  
  @Put('groups/:id/admins/:userId')
  async toggleGroupAdmin(
    @Request() req,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
    @Body('isAdmin') isAdmin: boolean,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.groupService.toggleGroupAdmin(groupId, user._id, userId, isAdmin);
  }
  
  @Delete('groups/:id/leave')
  async leaveGroup(
    @Request() req,
    @Param('id') groupId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    // 自己退出群组
    return this.groupService.removeGroupMember(groupId, user._id, user._id);
  }
  
  @Delete('groups/:id')
  async disbandGroup(@Request() req, @Param('id') groupId: string) {
    const user = req.user as AuthenticatedUser;
    return this.groupService.disbandGroup(groupId, user._id);
  }
  
  @Put('groups/:id')
  async updateGroup(
    @Request() req,
    @Param('id') groupId: string,
    @Body() updateData: UpdateGroupDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const group = await this.groupService.getGroupById(groupId);
    
    // 只有群主或管理员可以更新群资料
    const userIdObj = transformObjectId(user._id);
    const isAuthorized = group.owner.equals(userIdObj) || 
                        group.admins.some(id => id.equals(userIdObj));
    
    if (!isAuthorized) {
      throw new ForbiddenException('只有群主或管理员可以更新群资料');
    }
    
    // 简单实现（可以移到 GroupService 中）
    return this.groupService['groupModel'].findByIdAndUpdate(
      groupId,
      { $set: updateData },
      { new: true }
    );
  }
}