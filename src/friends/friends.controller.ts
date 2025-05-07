import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Request, Query, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FriendsService } from './friends.service';

// friends.controller.ts
@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private friendsService: FriendsService) { }

  // 获取我的好友列表
  @Get()
  getFriends(@Request() req) {
    const userId = req.user.userId;
    return this.friendsService.getFriends(userId);
  }

  // 发送好友请求
  @Post('requests')
  sendFriendRequest(@Request() req, @Body() dto: { receiverId: string; message?: string }) {
    const senderId = req.user.userId;
    return this.friendsService.sendFriendRequest(senderId, dto.receiverId, dto.message);
  }

  // 获取我收到的好友请求
  @Get('requests/received')
  getReceivedFriendRequests(@Request() req) {
    const userId = req.user.userId;
    return this.friendsService.getReceivedFriendRequests(userId);
  }

  // 获取我发送的好友请求
  @Get('requests/sent')
  getSentFriendRequests(@Request() req) {
    const userId = req.user.userId;
    return this.friendsService.getSentFriendRequests(userId);
  }

  // 处理好友请求
  @Patch('requests/:requestId')
  handleFriendRequest(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body() dto: { action: 'accept' | 'reject' | 'ignore' },
  ) {
    const userId = req.user.userId;
    return this.friendsService.handleFriendRequest(userId, requestId, dto.action);
  }

  // 删除好友请求记录
  @UseGuards(JwtAuthGuard)
  @Delete('requests/:requestId')
  async deleteFriendRequestRecord(
    @Req() req,
    @Param('requestId') requestId: string,
  ) {
    const userId = req.user.userId; // Assuming userId is in JWT payload
    return this.friendsService.deleteFriendRequestRecord(userId, requestId);
  }

  // 新增：获取单个好友关系的详细信息
  // 将此端点放在 /:friendId/remark 和 /:friendId (DELETE) 之前，以避免路由冲突
  // 或者使用更明确的路径，如 /relation/:relationId
  @Get('relation/:relationId') // 使用更明确的路径
  async getFriendRelationDetails(
    @Request() req,
    @Param('relationId') relationId: string,
  ) {
    const userId = req.user.userId;
    return this.friendsService.getFriendRelationDetails(userId, relationId);
  }

  // 设置好友备注
  @Patch(':friendId/remark') // 注意：这里的 friendId 是 User._id
  setFriendRemark(
    @Request() req,
    @Param('friendId') friendId: string,
    @Body() dto: { remark: string },
  ) {
    const userId = req.user.userId;
    return this.friendsService.setFriendRemark(userId, friendId, dto.remark);
  }

  // 删除好友
  @Delete(':friendId') // 注意：这里的 friendId 是 User._id
  removeFriend(@Request() req, @Param('friendId') friendId: string) {
    const userId = req.user.userId;
    return this.friendsService.removeFriend(userId, friendId);
  }

  // 获取所有好友分类
  @Get('categories')
  async getFriendCategories(@Request() req) {
    const userId = req.user.userId;
    return this.friendsService.getFriendCategories(userId);
  }

  // 获取分类后的好友列表
  @Get('by-category')
  async getFriendsByCategory(@Request() req) {
    const userId = req.user.userId;
    return this.friendsService.getFriendsByCategory(userId);
  }

  // 更新好友分类
  @Patch(':friendId/category')
  async updateFriendCategory(
    @Request() req,
    @Param('friendId') friendId: string,
    @Body() dto: { category: string }
  ) {
    const userId = req.user.userId;
    return this.friendsService.updateFriendCategory(userId, friendId, dto.category);
  }

  // 创建新分类并移动好友
  @Post('categories')
  async createCategoryAndMoveFriends(
    @Request() req,
    @Body() dto: { category: string, friendIds: string[] }
  ) {
    const userId = req.user.userId;
    return this.friendsService.createCategoryAndMoveFriends(userId, dto.category, dto.friendIds);
  }
}
