import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Query,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InformService } from './inform.service';
import { CreateInformDto } from './dto/create-inform.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserDocument } from '../users/user.schema';
// import { PermissionsGuard } from '../auth/guards/permissions.guard'; // 稍后集成
// import { Permissions } from '../auth/decorators/permissions.decorator'; // 稍后集成

@Controller('informs')
@UseGuards(JwtAuthGuard) // 对所有 informs 路由启用 JWT 认证
export class InformController {
  constructor(private readonly informService: InformService) {}

  /**
   * @description 创建通知草稿 (仅保存，不发布)
   * @route POST /informs/draft
   */
  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  // @UseGuards(PermissionsGuard) // 示例：更细致的权限控制
  // @Permissions('inform:create_draft')
  async createDraft(@Body() createInformDto: CreateInformDto, @Request() req) {
    const sender = req.user as UserDocument;
    // InformService 的 create 方法现在默认就是创建草稿
    return this.informService.create(createInformDto, sender);
  }

  /**
   * @description 创建并立即发布通知
   * @route POST /informs/publish-new
   */
  @Post('publish-new')
  @HttpCode(HttpStatus.CREATED)
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:create_and_publish') // 可能需要一个合并的权限
  async createAndPublish(
    @Body() createInformDto: CreateInformDto, // DTO 可能需要一个字段来指示意图，或者由 service 处理
    @Request() req,
  ) {
    const sender = req.user as UserDocument;
    // 这里需要 InformService 提供一个直接创建并发布的方法
    // 或者在 CreateInformDto 中加一个字段如 publishImmediately: true
    // 然后 create 方法根据这个字段决定是否调用内部的发布逻辑
    // 为了清晰，我们假设 InformService 有一个 createAndPublish 方法
    return this.informService.createAndPublish(createInformDto, sender);
  }

  /**
   * @description 发布一个已存在的草稿通知
   * @route POST /informs/:id/publish
   * @param id Inform 文档的 ID
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  // @UseGuards(PermissionsGuard)
  // @Permissions('inform:publish_draft')
  async publishDraft(@Param('id') informId: string, @Request() req) {
    const publisher = req.user as UserDocument;
    return this.informService.publish(informId, publisher);
  }
}
