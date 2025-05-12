import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
  Query,
  Req,
  Put,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FriendsService } from './friends.service';

// friends.controller.ts
@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  // 获取我的好友列表
  @Get()
  getFriends(@Request() req) {
    const userId = req.user._id;
    return this.friendsService.getFriends(userId);
  }

  // 发送好友请求
  @Post('requests')
  sendFriendRequest(
    @Request() req,
    @Body() dto: { receiverId: string; message?: string },
  ) {
    const senderId = req.user._id;
    return this.friendsService.sendFriendRequest(
      senderId,
      dto.receiverId,
      dto.message,
    );
  }

  // 获取我收到的好友请求
  @Get('requests/received')
  getReceivedFriendRequests(@Request() req) {
    const userId = req.user._id;
    return this.friendsService.getReceivedFriendRequests(userId);
  }

  // 获取我发送的好友请求
  @Get('requests/sent')
  getSentFriendRequests(@Request() req) {
    const userId = req.user._id;
    return this.friendsService.getSentFriendRequests(userId);
  }

  // 处理好友请求
  @Patch('requests/:requestId')
  handleFriendRequest(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body() dto: { action: 'accept' | 'reject' | 'ignore' },
  ) {
    const userId = req.user._id;
    return this.friendsService.handleFriendRequest(
      userId,
      requestId,
      dto.action,
    );
  }

  // 删除好友请求记录
  @UseGuards(JwtAuthGuard)
  @Delete('requests/:requestId')
  async deleteFriendRequestRecord(
    @Req() req,
    @Param('requestId') requestId: string,
  ) {
    const userId = req.user._id; // Assuming userId is in JWT payload
    return this.friendsService.deleteFriendRequestRecord(userId, requestId);
  }

  // 获取单个好友关系的详细信息
  // 将此端点放在 /:friendId/remark 和 /:friendId (DELETE) 之前，以避免路由冲突
  // 或者使用更明确的路径，如 /relation/:relationId
  @Get('relation/:relationId') // 使用更明确的路径
  async getFriendRelationDetails(
    @Request() req,
    @Param('relationId') relationId: string,
  ) {
    const userId = req.user._id;
    return this.friendsService.getFriendRelationDetails(userId, relationId);
  }

  // 设置好友备注
  @Patch(':friendId/remark') // 注意：这里的 friendId 是 User._id
  setFriendRemark(
    @Request() req,
    @Param('friendId') friendId: string,
    @Body() dto: { remark: string },
  ) {
    const userId = req.user._id;
    return this.friendsService.setFriendRemark(userId, friendId, dto.remark);
  }

  // 删除好友
  @Delete(':friendId') // 注意：这里的 friendId 是 User._id
  removeFriend(@Request() req, @Param('friendId') friendId: string) {
    const userId = req.user._id;
    return this.friendsService.removeFriend(userId, friendId);
  }

  // 获取所有好友分类
  @Get('categories')
  async getFriendCategories(@Request() req) {
    const userId = req.user._id;
    return this.friendsService.getFriendCategories(userId);
  }

  // 创建分类
  @Post('categories')
  async createFriendCategory(
    @Request() req,
    @Body() dto: { name: string }, // DTO 包含分类名称
  ) {
    const userId = req.user._id;
    return this.friendsService.createFriendCategory(userId, dto.name);
  }

  // 修改好友分类名称
  @Put('categories/:categoryId') // 或者使用 PATCH
  async updateFriendCategoryName(
    @Request() req,
    @Param('categoryId') categoryId: string,
    @Body() dto: { name: string },
  ) {
    const userId = req.user._id;
    return this.friendsService.updateFriendCategoryName(
      userId,
      categoryId,
      dto.name,
    );
  }

  // 获取分类后的好友列表
  @Get('by-category')
  async getFriendsByCategory(@Request() req) {
    const userId = req.user._id;
    return this.friendsService.getFriendsByCategory(userId);
  }

  // 更新好友分类
  @Patch(':friendId/category')
  async updateFriendCategory(
    @Request() req,
    @Param('friendId') friendId: string,
    @Body() dto: { category: string },
  ) {
    const userId = req.user._id;
    return this.friendsService.updateFriendCategory(
      userId,
      friendId,
      dto.category,
    );
  }

  // 删除好友分类
  @Delete('categories/:categoryId')
  async deleteFriendCategory(
    @Request() req,
    @Param('categoryId') categoryId: string,
  ) {
    const userId = req.user._id;
    return this.friendsService.deleteFriendCategory(userId, categoryId); // 调用 service 方法
  }

  // // 创建新分类并移动好友
  // @Post('categories')
  // async createCategoryAndMoveFriends(
  //   @Request() req,
  //   @Body() dto: { category: string, friendIds: string[] }
  // ) {
  //   const userId = req.user._id;
  //   return this.friendsService.createCategoryAndMoveFriends(userId, dto.category, dto.friendIds);
  // }
}
