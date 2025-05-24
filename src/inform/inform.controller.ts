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
} from '@nestjs/common';
import { InformService, PopulatedInformReceipt } from './inform.service'; // Import PopulatedInformReceipt
import { CreateInformDto } from './dto/create-inform.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { GetInformsQueryDto } from './dto/get-informs-query.dto';
import { PaginatedResponse } from '../types/paginated-response.interface';
import { Types } from 'mongoose'; // Import Types
import { GetMyCreatedInformsDto } from './dto/get-my-created-informs.dto'; // Import the new DTO
import { InformDocument } from './schemas/inform.schema';
import { AuthenticatedUser } from 'src/auth/types';

@Controller('informs')
@UseGuards(JwtAuthGuard) // 对所有 informs 路由启用 JWT 认证
export class InformController {
  constructor(private readonly informService: InformService) {}

  /**
   * @description 获取当前用户的通知列表 (支持分页、筛选、排序)
   * @route GET /informs/my-informs
   */
  @Get('my-informs')
  @UseGuards(PermissionsGuard)
  @Permissions('inform:read_feed_own')
  @HttpCode(HttpStatus.OK)
  async getMyInforms(
    @Request() req,
    @Query() queryDto: GetInformsQueryDto,
  ): Promise<PaginatedResponse<PopulatedInformReceipt>> {
    // Changed to PaginatedResponse<PopulatedInformReceipt>
    const user = req.user as AuthenticatedUser;
    // Convert string userId to Types.ObjectId before calling the service
    const userIdAsObjectId = new Types.ObjectId(user.id);
    return this.informService.getInformsForUser(userIdAsObjectId, queryDto);
  }

  /**
   * @description 创建通知草稿 (仅保存，不发布)
   * @route POST /informs/draft
   */
  @Post('draft')
  @UseGuards(PermissionsGuard)
  @Permissions('inform:create')
  @HttpCode(HttpStatus.CREATED)
  async createDraft(@Body() createInformDto: CreateInformDto, @Request() req) {
    const sender = req.user as AuthenticatedUser;
    // InformService 的 create 方法现在默认就是创建草稿
    return this.informService.create(createInformDto, sender);
  }

  /**
   * @description 发布一个已存在的草稿通知
   * @route POST /informs/:id/publish
   * @param id Inform 文档的 ID
   */
  @Post(':id/publish')
  @UseGuards(PermissionsGuard)
  @Permissions('inform:create')
  @HttpCode(HttpStatus.OK)
  async publishDraft(@Param('id') informId: string, @Request() req) {
    const publisher = req.user as AuthenticatedUser;
    return this.informService.publish(informId, publisher);
  }

  /**
   * @description 获取当前用户创建的通知列表 (支持分页、筛选、排序)
   * @route GET /informs/my-created
   */
  @Get('my-created')
  @UseGuards(PermissionsGuard)
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
   * @description 获取指定ID的通知详情
   * @route GET /informs/:id
   * @param id Inform 文档的 ID
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getInformById(
    @Param('id') id: string,
    @Request() req, // Get the request object
  ): Promise<InformDocument> {
    const currentUser = req.user as AuthenticatedUser; // Extract the authenticated user
    return this.informService.findOneById(id, currentUser);
  }
}
