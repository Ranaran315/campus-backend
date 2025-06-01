import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Delete,
  UseInterceptors,
  UploadedFile,
  Put,
} from '@nestjs/common';
import { InformService, PopulatedInformReceipt } from './inform.service'; // Import PopulatedInformReceipt
import { CreateInformDto } from './dto/create-inform.dto';
import { PublishInformDto } from './dto/publish-inform.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { GetInformsQueryDto } from './dto/get-informs-query.dto';
import { PaginatedResponse } from '../types/paginated-response.interface';
import { Types } from 'mongoose'; // Import Types
import { GetMyCreatedInformsDto } from './dto/get-my-created-informs.dto'; // Import the new DTO
import { InformDocument } from './schemas/inform.schema';
import { AuthenticatedRequest, AuthenticatedUser } from 'src/auth/types';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  getGeneralMulterStorage,
  getUserMulterStorage,
  UserFileInterceptor,
} from '../utils/local-upload';

@Controller('informs')
@UseGuards(JwtAuthGuard) // 对所有 informs 路由启用 JWT 认证
export class InformController {
  constructor(private readonly informService: InformService) {}

  /**
   * @description 获取当前用户的通知列表 (支持分页、筛选、排序)
   * @route GET /informs/my-informs
   */
  @Get('my-informs')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:read_feed_own')
  @HttpCode(HttpStatus.OK)
  async getMyInforms(
    @Request() req,
    @Query() queryDto: GetInformsQueryDto,
  ): Promise<PaginatedResponse<PopulatedInformReceipt>> {
    const user = req.user as AuthenticatedUser;
    const userIdAsObjectId = new Types.ObjectId(user.id);
    return this.informService.getInformsForUser(userIdAsObjectId, queryDto);
  }

  /**
   * @description 创建通知草稿 (仅保存，不发布)
   * @route POST /informs/draft
   */
  @Post('draft')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:create')
  @HttpCode(HttpStatus.CREATED)
  async createDraft(@Body() createInformDto: CreateInformDto, @Request() req) {
    const sender = req.user as AuthenticatedUser;
    // InformService 的 create 方法现在默认就是创建草稿
    return this.informService.create(createInformDto, sender);
  }

  /**
   * @description 更新已存在的通知草稿
   * @route PUT /informs/:id
   * @param id Inform 文档的 ID
   */
  @Put(':id')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:update_draft') // Example permission, adjust as needed
  @HttpCode(HttpStatus.OK)
  async updateDraft(
    @Param('id') informId: string,
    @Body() updateInformDto: CreateInformDto, // Using CreateInformDto for now, consider a specific UpdateInformDto if needed
    @Request() req: AuthenticatedRequest,
  ) {
    const currentUser = req.user as AuthenticatedUser;
    return this.informService.updateDraft(informId, updateInformDto, currentUser);
  }

  /**
   * @description 发布一个已存在的草稿通知
   * @route POST /informs/:id/publish
   * @param id Inform 文档的 ID
   */
  @Post(':id/publish')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:create')
  @HttpCode(HttpStatus.OK)
  async publishDraft(
    @Param('id') informId: string,
    @Body() publishInformDto: PublishInformDto,
    @Request() req,
  ) {
    const publisher = req.user as AuthenticatedUser;
    return this.informService.publish(informId, publisher, publishInformDto);
  }

  /**
   * @description 获取当前用户创建的通知列表 (支持分页、筛选、排序)
   * @route GET /informs/my-created
   */
  @Get('my-created')
  // @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getMyCreatedInforms(
    @Request() req,
    @Query() queryDto: GetMyCreatedInformsDto,
  ): Promise<PaginatedResponse<InformDocument>> {
    const user = req.user as AuthenticatedUser;
    const userIdAsObjectId = new Types.ObjectId(user._id); // Ensure user._id is used
    return this.informService.getMyCreatedInforms(userIdAsObjectId, queryDto);
  }

  /**
   * @description 通过回执ID获取通知详情
   * @route GET /informs/receipt/:id
   * @param id 回执ID
   */
  @Get('receipt/:id/detail')
  @HttpCode(HttpStatus.OK)
  async getReceiptById(
    @Param('id') receiptId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const currentUser = req.user;
    const receipt = await this.informService.getReceiptById(
      receiptId,
      currentUser,
    );
    return receipt;
  }

  /**
   * @description 获取指定ID的通知详情
   * @route GET /informs/:id
   * @param id Inform 文档的 ID
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getInformById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<InformDocument> {
    const currentUser = req.user; // Extract the authenticated user
    return this.informService.findOneById(id, currentUser);
  }

  /**
   * @description 删除草稿状态的通知
   * @route DELETE /informs/:id
   * @param id Inform 文档的 ID
   */
  @Delete(':id')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:delete')
  @HttpCode(HttpStatus.OK)
  async deleteDraft(@Param('id') informId: string, @Request() req) {
    const currentUser = req.user as AuthenticatedUser;
    await this.informService.deleteDraft(informId, currentUser);
    return { success: true, message: '通知草稿已成功删除' };
  }

  /**
   * @description 撤销已发布的通知
   * @route POST /informs/:id/revoke
   * @param id Inform 文档的 ID
   */
  @Post(':id/revoke')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:revoke')
  @HttpCode(HttpStatus.OK)
  async revokePublishedInform(@Param('id') informId: string, @Request() req) {
    const currentUser = req.user as AuthenticatedUser;
    await this.informService.revokePublishedInform(informId, currentUser);
    return { success: true, message: '通知已成功撤销发布' };
  }

  /**
   * @description 归档已发布的通知
   * @route POST /informs/:id/archive
   * @param id Inform 文档的 ID
   */
  @Post(':id/archive')
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:archive')
  @HttpCode(HttpStatus.OK)
  async archivePublishedInform(@Param('id') informId: string, @Request() req) {
    const currentUser = req.user as AuthenticatedUser;
    await this.informService.archivePublishedInform(informId, currentUser);
    return { success: true, message: '通知已成功归档' };
  }

  /**
   * @description 标记通知为已读
   * @route POST /informs/:id/read
   * @param id 回执ID
   */
  @Post('receipt/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id') receiptId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const currentUser = req.user;
    const updatedReceipt = await this.informService.markAsRead(
      receiptId,
      currentUser,
    );
    return { success: true, data: updatedReceipt };
  }

  /**
   * @description 标记通知为未读
   * @route POST /informs/:id/unread
   * @param id 回执ID
   */
  @Post('receipt/:id/unread')
  @UseGuards(JwtAuthGuard)
  async markAsUnread(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const currentUser = req.user;
    return this.informService.markAsUnread(id, currentUser);
  }

  /**
   * @description 设置通知置顶状态
   * @route POST /informs/:id/pin
   * @param id 回执ID
   */
  @Post('receipt/:id/pin')
  @HttpCode(HttpStatus.OK)
  async togglePin(
    @Param('id') receiptId: string,
    @Body() pinDto: { isPinned: boolean },
    @Request() req,
  ) {
    const currentUser = req.user as AuthenticatedUser;
    const updatedReceipt = await this.informService.togglePin(
      receiptId,
      pinDto.isPinned,
      currentUser,
    );
    return { success: true, data: updatedReceipt };
  }

  /**
   * @description 删除用户的通知回执
   * @route DELETE /informs/:id/receipt
   * @param id 回执ID
   */
  @Delete(':id/receipt')
  @HttpCode(HttpStatus.OK)
  async deleteReceipt(@Param('id') receiptId: string, @Request() req) {
    const currentUser = req.user as AuthenticatedUser;
    await this.informService.deleteReceipt(receiptId, currentUser);
    return { success: true, message: '通知已成功删除' };
  }

  /**
   * @description 获取当前用户未读通知回执数量
   * @route GET /informs/receipt/unread/count
   */
  @Get('receipt/unread/count')
  @UseGuards(JwtAuthGuard)
  async getUnreadCount(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ count: number }> {
    const userId = req.user._id;
    const count = await this.informService.getUnreadCountForUser(userId);

    return { count };
  }

  /**
   * @description 通知附件上传（按用户ID分目录存储）
   * @route POST /informs/upload-attachment
   * @returns { url, filename, originalname, mimetype, size }
   */
  @Post('upload-attachment')
  @UseInterceptors(
    UserFileInterceptor('file', 'inform-attachments', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        // 可根据需要限制类型
        cb(null, true);
      },
    }),
  )
  async uploadInformAttachment(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { success: false, message: '未检测到上传文件' };
    }

    const userId = req.user._id.toString();
    const url = `/uploads/inform-attachments/${userId}/${file.filename}`;

    return {
      success: true,
      url,
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  }
}
