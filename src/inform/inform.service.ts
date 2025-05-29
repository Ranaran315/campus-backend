import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Inform, InformDocument } from './schemas/inform.schema';
import {
  InformReceipt,
  InformReceiptDocument,
} from './schemas/inform-receipt.schema';
import {
  InformComment,
  InformCommentDocument,
} from './schemas/inform-comment.schema';
import { CreateInformDto } from './dto/create-inform.dto';
import { PublishInformDto } from './dto/publish-inform.dto';
import { UsersService } from '../users/users.service';
import { CollegeService } from '../college/college.service';
import { MajorService } from '../major/major.service';
import { AcademicClassService } from '../academic-class/academic-class.service';
import { RoleService } from '../role/role.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { UserDocument } from '../users/schemas/user.schema'; // Keep for internal use like _executePublishActions
import {
  GetInformsQueryDto,
  InformSortByQuery,
  InformStatusQuery,
  SortOrderQuery,
} from './dto/get-informs-query.dto';
import { PaginatedResponse } from '../types/paginated-response.interface'; // Corrected path
import { GetMyCreatedInformsDto } from './dto/get-my-created-informs.dto'; // Import the new DTO
import { AuthenticatedUser } from 'src/auth/types';
import { transformObjectId } from 'src/utils/transform';

// Define the PopulatedInformReceipt interface
export interface PopulatedInformReceipt
  extends Omit<InformReceiptDocument, 'inform'> {
  inform: InformDocument | null;
}

@Injectable()
export class InformService {
  private readonly logger = new Logger(InformService.name);

  constructor(
    @InjectModel(Inform.name) private informModel: Model<InformDocument>,
    @InjectModel(InformReceipt.name)
    private informReceiptModel: Model<InformReceiptDocument>,
    @InjectModel(InformComment.name)
    private informCommentModel: Model<InformCommentDocument>,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly collegeService: CollegeService,
    private readonly majorService: MajorService,
    private readonly academicClassService: AcademicClassService,
    private readonly roleService: RoleService,
    private readonly notificationsGateway: NotificationsGateway, // 确保 NotificationsGateway 在 NotificationsModule 中被导出
  ) {}

  // --- 创建草稿通知 ---
  async create(
    createInformDto: CreateInformDto,
    senderAuth: AuthenticatedUser,
  ): Promise<InformDocument> {
    const senderDoc = await this.usersService.findOneById(senderAuth._id);
    if (!senderDoc) {
      throw new NotFoundException(
        `Sender with ID '${senderAuth._id}' not found.`,
      );
    }
    this.logger.log(
      `Attempting to create inform DRAFT by sender: ${senderDoc.username}`,
    );

    let deadlineDate: Date | undefined = undefined;
    if (
      createInformDto.deadline &&
      typeof createInformDto.deadline === 'string'
    ) {
      deadlineDate = new Date(createInformDto.deadline);
      if (isNaN(deadlineDate.getTime())) {
        throw new BadRequestException(
          'Invalid date format for deadline after conversion.',
        );
      }
    }

    // 修改创建通知时的字段赋值
    const newInform = new this.informModel({
      ...createInformDto,
      deadline: deadlineDate,
      sender: senderDoc._id, // 修改：senderId -> sender
      status: 'draft', // Explicitly set status to draft for this method
    });
    const savedInform = await newInform.save();
    this.logger.log(
      `Inform draft with ID ${savedInform._id} created successfully by ${senderDoc.username}.`,
    );
    return savedInform;
  }
  // --- 发布通知 ---
  async publish(
    informId: string,
    publisherAuth: AuthenticatedUser,
    publishDto?: PublishInformDto,
  ): Promise<InformDocument> {
    // 查找发布人
    const publisherDoc = await this.usersService.findOneById(publisherAuth._id);
    if (!publisherDoc) {
      throw new NotFoundException(
        `Publisher with ID '${publisherAuth._id}' not found.`,
      );
    }
    this.logger.log(
      `Attempting to publish inform ID: ${informId} by publisher: ${publisherDoc.username}`,
    );

    // 查找通知
    const informToPublish = await this.informModel.findById(informId);
    if (!informToPublish) {
      throw new NotFoundException(`通知 ID '${informId}' 未找到。`);
    }
    if (informToPublish.status === 'published') {
      throw new BadRequestException(`通知 ID '${informId}' 已经发布。`);
    }
    if (informToPublish.status === 'archived') {
      throw new BadRequestException(
        `通知 ID '${informId}' 已归档，无法再次发布。`,
      );
    }
    if (informToPublish.status !== 'draft') {
      throw new BadRequestException(
        `通知 ID '${informId}' 当前状态为 '${informToPublish.status}'，无法发布。请确保它是草稿状态。`,
      );
    }

    // 修改发布通知时的权限检查
    // 确保发布人是通知的原始发送者
    if (
      !transformObjectId(informToPublish.sender).equals(
        transformObjectId(publisherDoc._id),
      )
    ) {
      throw new BadRequestException('您没有权限发布此通知草稿。');
    } // 更新通知数据：将前端提供的信息应用到通知中
    if (publishDto) {
      // 更新目标范围信息
      if (publishDto.targetScope) {
        informToPublish.targetScope = publishDto.targetScope;
      }
      if (publishDto.targetUsers) {
        informToPublish.targetUsers = publishDto.targetUsers;
      }
      if (publishDto.userTypeFilter) {
        informToPublish.userTypeFilter = publishDto.userTypeFilter;
      }

      // 更新其他通知内容字段
      if (publishDto.title !== undefined) {
        informToPublish.title = publishDto.title;
      }
      if (publishDto.content !== undefined) {
        informToPublish.content = publishDto.content;
      }
      if (publishDto.description !== undefined) {
        informToPublish.description = publishDto.description;
      }
      if (publishDto.importance !== undefined) {
        informToPublish.importance = publishDto.importance;
      }
      if (publishDto.tags !== undefined) {
        informToPublish.tags = publishDto.tags;
      }
      if (publishDto.allowReplies !== undefined) {
        informToPublish.allowReplies = publishDto.allowReplies;
      }
      if (publishDto.attachments !== undefined) {
        informToPublish.attachments = publishDto.attachments;
      }
      if (publishDto.deadline !== undefined) {
        informToPublish.deadline = publishDto.deadline
          ? new Date(publishDto.deadline)
          : undefined;
      }
      if (publishDto.isPublic !== undefined) {
        informToPublish.isPublic = publishDto.isPublic;
      }
      if (publishDto.trackReadStatus !== undefined) {
        informToPublish.trackReadStatus = publishDto.trackReadStatus;
      }
      if (publishDto.requireConfirm !== undefined) {
        informToPublish.requireConfirm = publishDto.requireConfirm;
      }
    }

    // 更新状态和发布时间
    const originalSenderDoc = publisherDoc;
    informToPublish.status = 'published';
    informToPublish.publishAt = new Date();
    const savedPublishedInform = await informToPublish.save();

    // 执行公共的发布操作
    await this._executePublishActions(savedPublishedInform, originalSenderDoc);

    this.logger.log(
      `Inform ID: ${savedPublishedInform._id} published successfully.`,
    );
    return savedPublishedInform;
  }

  /**
   * @description 封装了发布通知时的核心动作：解析目标用户、创建回执、发送WebSocket。
   * @param informDoc 已保存的、状态为 'published' 的通知文档
   * @param originalSenderDoc 用于解析 SENDER_* 目标类型的原始发送者 UserDocument
   * @private
   */
  private async _executePublishActions(
    informDoc: InformDocument,
    originalSenderDoc: UserDocument, // Renamed for clarity, type remains UserDocument
  ): Promise<void> {
    let targetUserIds: Types.ObjectId[] = [];
    const { targetScope, targetUsers, userTypeFilter } = informDoc; // 修改：targetIds -> targetUsers

    switch (targetScope) {
      case 'ALL':
        targetUserIds =
          await this.usersService.findAllUserIdsByFilter(userTypeFilter);
        break;
      case 'ROLE':
        if (!targetUsers || targetUsers.length === 0) {
          // 修改：targetIds -> targetUsers
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：角色目标类型必须提供角色ID列表。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByRoleIds(
          targetUsers, // 修改：targetIds -> targetUsers
          userTypeFilter,
        );
        break;
      case 'COLLEGE':
        if (!targetUsers || targetUsers.length === 0) {
          // 修改：targetIds -> targetUsers
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：学院目标类型必须提供学院ID列表。`,
          );
        }
        for (const collegeId of targetUsers) {
          // 修改：targetIds -> targetUsers
          const college = await this.collegeService.findOne(collegeId);
          if (!college)
            throw new NotFoundException(
              `发布通知 ${informDoc._id} 失败：学院ID '${collegeId}' 不存在。`,
            );
        }
        targetUserIds = await this.usersService.findUserIdsByCollegeIds(
          targetUsers, // 修改：targetIds -> targetUsers
          userTypeFilter,
        );
        break;
      case 'MAJOR':
        if (!targetUsers || targetUsers.length === 0) {
          // 修改：targetIds -> targetUsers
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：专业目标类型必须提供专业ID列表。`,
          );
        }
        for (const majorId of targetUsers) {
          // 修改：targetIds -> targetUsers
          const major = await this.majorService.findOne(majorId);
          if (!major)
            throw new NotFoundException(
              `发布通知 ${informDoc._id} 失败：专业ID '${majorId}' 不存在。`,
            );
        }
        targetUserIds = await this.usersService.findUserIdsByMajorIds(
          targetUsers, // 修改：targetIds -> targetUsers
          userTypeFilter,
        );
        break;
      case 'ACADEMIC_CLASS':
        if (!targetUsers || targetUsers.length === 0) {
          // 修改：targetIds -> targetUsers
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：班级目标类型必须提供班级ID列表。`,
          );
        }
        for (const classId of targetUsers) {
          // 修改：targetIds -> targetUsers
          const academicClass =
            await this.academicClassService.findOne(classId);
          if (!academicClass)
            throw new NotFoundException(
              `发布通知 ${informDoc._id} 失败：班级ID '${classId}' 不存在。`,
            );
        }
        targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
          targetUsers, // 修改：targetIds -> targetUsers
          userTypeFilter,
        );
        break;
      case 'SPECIFIC_USERS':
        if (!targetUsers || targetUsers.length === 0) {
          // 修改：targetIds -> targetUsers
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：特定用户目标类型必须提供用户ID列表。`,
          );
        }
        const users = await this.usersService.findUsersByIds(
          targetUsers.map((id) => new Types.ObjectId(id)), // 修改：targetIds -> targetUsers
        );
        if (users.length !== targetUsers.length) {
          // 修改：targetIds -> targetUsers
          this.logger.warn(
            `发布通知 ${informDoc._id} 时，部分指定用户ID无效。`,
          );
        }
        targetUserIds = users.map((user) => user._id);
        break;
      case 'SENDER_OWN_CLASS':
        if (
          originalSenderDoc.userType !== 'student' ||
          !originalSenderDoc.academicClass
        ) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：原始发送者设置不适用于“发送者所在班级”目标类型。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
          [originalSenderDoc.academicClass.toString()],
          userTypeFilter,
        );
        break;
      case 'SENDER_MANAGED_CLASSES':
        if (
          originalSenderDoc.userType !== 'staff' ||
          !originalSenderDoc.staffInfo?.managedClasses ||
          originalSenderDoc.staffInfo.managedClasses.length === 0
        ) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：原始发送者设置不适用于“发送者管理的所有班级”目标类型。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
          originalSenderDoc.staffInfo.managedClasses.map((id) => id.toString()),
          userTypeFilter,
        );
        break;
      case 'SENDER_COLLEGE_STUDENTS':
        let senderCollegeId: Types.ObjectId | string | undefined;
        if (
          originalSenderDoc.userType === 'student' &&
          originalSenderDoc.college
        ) {
          senderCollegeId = originalSenderDoc.college;
        } else if (
          originalSenderDoc.userType === 'staff' &&
          originalSenderDoc.staffInfo?.department
        ) {
          senderCollegeId = originalSenderDoc.staffInfo.department;
        }
        if (!senderCollegeId) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：无法确定原始发送者所属学院。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByCollegeIds(
          [senderCollegeId.toString()],
          'student', // Explicitly filter for students of that college
        );
        break;
      default:
        throw new BadRequestException(
          `发布通知 ${informDoc._id} 失败：通知定义中的目标类型 '${targetScope}' 无效。`,
        );
    }

    const uniqueUserIds = Array.from(
      new Set(targetUserIds.map((id) => id.toString())),
    ).map((idStr) => new Types.ObjectId(idStr));

    if (uniqueUserIds.length === 0) {
      this.logger.warn(
        `No target users found for publishing inform ID: ${informDoc._id}. The inform is published but has no recipients.`,
      );
    }

    if (uniqueUserIds.length > 0) {
      this.logger.log(
        `准备为通知 ${informDoc._id} 创建 ${uniqueUserIds.length} 条回执记录`,
      );

      const receiptsToCreate = uniqueUserIds.map((userId) => ({
        inform: informDoc._id,
        user: userId,
        isRead: false,
      }));

      try {
        const createdReceipts = await this.informReceiptModel.insertMany(
          receiptsToCreate,
          {
            ordered: false,
          },
        );

        this.logger.log(`成功创建了 ${createdReceipts.length} 条回执记录`);
      } catch (error) {
        // 提取写入错误的详细信息
        const writeErrors = error.writeErrors || [];
        const duplicateKeyErrors = writeErrors.filter(
          (err) => err.code === 11000,
        );
        const otherErrors = writeErrors.filter((err) => err.code !== 11000);

        this.logger.error(
          `创建通知 ${informDoc._id} 的回执时出错: ${error.message}`,
          {
            duplicateErrors: duplicateKeyErrors.length,
            otherErrors: otherErrors.length,
          },
        );

        // 如果全部失败，记录更严重的错误
        if (writeErrors.length === uniqueUserIds.length) {
          this.logger.error(
            `严重错误: 通知 ${informDoc._id} 的所有回执创建均失败!`,
          );
        }

        // 对于开发环境，可以记录更多详细信息
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(`错误详情:`, error);
        }
      }
    }

    // 发送 WebSocket 通知
    uniqueUserIds.forEach((userId) => {
      // @ts-ignore
      const informIdStr = informDoc._id.toString();
      this.notificationsGateway.sendNewInformNotification(userId.toString(), {
        id: informIdStr,
        title: informDoc.title,
        // Cast informDoc.importance to the specific literal union type
        importance: informDoc.importance as 'low' | 'medium' | 'high',
        senderName: originalSenderDoc.nickname || originalSenderDoc.username,
        createdAt: informDoc.publishAt || new Date(),
      });
    });

    this.logger.log(
      `Finished publish actions for inform ID: ${informDoc._id} to ${uniqueUserIds.length} users.`,
    );
  }

  async getInformsForUser(
    userId: Types.ObjectId,
    queryDto: GetInformsQueryDto,
  ): Promise<PaginatedResponse<PopulatedInformReceipt>> {
    const sampleReceipt = await this.informReceiptModel
      .findOne({ user: userId })
      .lean()
      .exec();
    this.logger.debug(`样本回执原始数据: ${JSON.stringify(sampleReceipt)}`);

    const {
      page = 1,
      limit = 10,
      status,
      importance,
      sortBy,
      sortOrder,
      searchQuery, // 提取搜索查询参数
    } = queryDto;

    const findQuery: any = { user: userId };

    if (status && status !== InformStatusQuery.ALL) {
      findQuery.isRead = status === InformStatusQuery.READ;
    }

    // 处理搜索查询
    if (searchQuery && searchQuery.trim() !== '') {
      // 1. 先在 Inform 集合中搜索匹配的通知
      const searchRegex = { $regex: searchQuery, $options: 'i' };
      const matchingInforms = await this.informModel
        .find({
          $or: [
            { title: searchRegex }, // 搜索标题
            { content: searchRegex }, // 搜索内容
            { tags: searchRegex }, // 搜索标签
          ],
        })
        .select('_id')
        .lean()
        .exec();

      const matchingInformIds = matchingInforms.map(
        (inform) => inform._id as Types.ObjectId,
      );

      if (matchingInformIds.length === 0) {
        // 没有找到匹配的通知，返回空结果
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        };
      }

      // 2. 将匹配的通知ID添加到回执查询条件中
      if (findQuery.inform) {
        // 如果已经有 inform 条件（如importance筛选），取交集
        const existingInformIds = findQuery.inform.$in;
        const intersectedIds = matchingInformIds.filter((id) =>
          existingInformIds.some((existingId) => existingId.equals(id)),
        );

        if (intersectedIds.length === 0) {
          // 交集为空，返回空结果
          return {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          };
        }

        findQuery.inform.$in = intersectedIds;
      } else {
        // 如果还没有 inform 条件，直接添加
        findQuery.inform = { $in: matchingInformIds };
      }
    }

    if (importance) {
      const searchRegex = { $regex: searchQuery, $options: 'i' };
      const informsMatchingImportance = await this.informModel
        .find({
          $or: [
            { title: searchRegex }, // 搜索标题
            { content: searchRegex }, // 搜索内容
            { tags: searchRegex }, // 搜索标签
          ],
        })
        .select('_id')
        .lean()
        .exec();
      const informIdsFilteredByImportance = informsMatchingImportance.map(
        (inform) => inform._id as Types.ObjectId,
      );

      if (informIdsFilteredByImportance.length === 0) {
        // No informs match this importance, so no receipts will be found
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        };
      }
      // Add the informId filter to the main query
      findQuery.inform = { $in: informIdsFilteredByImportance };
    }

    const sortOptions: any = { isPinned: -1 };

    if (
      sortBy === InformSortByQuery.PUBLISH_AT ||
      sortBy === InformSortByQuery.IMPORTANCE ||
      sortBy === InformSortByQuery.DEADLINE // Added DEADLINE to this condition
    ) {
      // Default sort by receivedAt for the database query, will sort in app later
      sortOptions['receivedAt'] = sortOrder === SortOrderQuery.ASC ? 1 : -1;
    } else {
      // Sort by fields directly on InformReceipt
      sortOptions[sortBy || 'receivedAt'] =
        sortOrder === SortOrderQuery.ASC ? 1 : -1;
    }

    const total = await this.informReceiptModel
      .countDocuments(findQuery)
      .exec();
    const totalPages = Math.ceil(total / limit);

    const fetchedReceipts = await this.informReceiptModel
      .find(findQuery)
      .populate({
        path: 'inform', // 使用新的字段名
        model: 'Inform', // 直接使用字符串而不是Inform.name
        strictPopulate: false, // 添加此选项以允许更灵活的填充
        populate: {
          path: 'sender',
          model: 'User',
          select: '_id realname nickname avatar',
          strictPopulate: false,
        },
      })
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    // Cast to PopulatedInformReceipt[]
    let processedReceipts: PopulatedInformReceipt[] =
      fetchedReceipts as unknown as PopulatedInformReceipt[];

    // Application-level sorting for fields on the populated Inform document
    if (sortBy === InformSortByQuery.PUBLISH_AT) {
      processedReceipts.sort((a, b) => {
        const dateA = a.inform?.publishAt?.getTime() || 0;
        const dateB = b.inform?.publishAt?.getTime() || 0;
        return sortOrder === SortOrderQuery.ASC ? dateA - dateB : dateB - dateA;
      });
    } else if (sortBy === InformSortByQuery.IMPORTANCE) {
      const importanceOrder = { high: 1, medium: 2, low: 3 };
      processedReceipts.sort((a, b) => {
        const importanceA = a.inform?.importance;
        const importanceB = b.inform?.importance;
        const orderA =
          importanceOrder[importanceA as 'high' | 'medium' | 'low'] || 3;
        const orderB =
          importanceOrder[importanceB as 'high' | 'medium' | 'low'] || 3;
        return sortOrder === SortOrderQuery.ASC
          ? orderA - orderB
          : orderB - orderA;
      });
    } else if (sortBy === InformSortByQuery.DEADLINE) {
      processedReceipts.sort((a, b) => {
        const deadlineA_time = a.inform?.deadline?.getTime();
        const deadlineB_time = b.inform?.deadline?.getTime();

        // Handle undefined/null deadlines: sort them to the end
        if (deadlineA_time == null && deadlineB_time == null) return 0; // both null, treat as equal
        if (deadlineA_time == null) return 1; // a is null, sort a after b (to the end)
        if (deadlineB_time == null) return -1; // b is null, sort a before b (b to the end)

        return sortOrder === SortOrderQuery.ASC
          ? deadlineA_time - deadlineB_time
          : deadlineB_time - deadlineA_time;
      });
    }

    // this.logger.debug('处理后的回执数据:', processedReceipts);

    return {
      data: processedReceipts,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async getMyCreatedInforms(
    userId: Types.ObjectId,
    queryDto: GetMyCreatedInformsDto,
  ): Promise<PaginatedResponse<InformDocument>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      status,
      searchQuery,
    } = queryDto;

    const query: any = { sender: userId }; // 修改：senderId -> sender

    if (status && status !== 'all') {
      query.status = status;
    }

    if (searchQuery) {
      const searchRegex = { $regex: searchQuery, $options: 'i' };
      query.$or = [{ title: searchRegex }, { tags: searchRegex }];
    }

    const sortOptions: { [key: string]: 'asc' | 'desc' } = {};
    sortOptions[sortBy] = sortOrder;

    const totalDocs = await this.informModel.countDocuments(query).exec();
    const informs = await this.informModel
      .find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(totalDocs / limit);

    return {
      data: informs,
      page,
      limit,
      total: totalDocs,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  private async isUserTargetOfInform(
    userId: Types.ObjectId,
    inform: InformDocument,
  ): Promise<boolean> {
    if (!inform.targetScope) return false;

    const user = await this.usersService.findOneById(userId.toString());
    if (!user) return false;

    switch (inform.targetScope) {
      case 'ALL':
        return true;
      case 'SPECIFIC_USERS':
        return (
          inform.targetUsers?.some(
            (
              targetUser, // 修改：targetIds -> targetUsers
            ) => transformObjectId(targetUser).equals(userId),
          ) || false
        );
      case 'ROLE':
        return (
          inform.targetUsers?.some(
            (
              roleId, // 修改：targetIds -> targetUsers
            ) =>
              user.roles.some(
                (userRole) =>
                  (userRole as any)._id?.equals(roleId) ||
                  userRole === transformObjectId(roleId),
              ),
          ) || false
        );
      case 'COLLEGE':
        return (
          inform.targetUsers?.some(
            (
              collegeId, // 修改：targetIds -> targetUsers
            ) => user.college?._id.equals(collegeId),
          ) || false
        );
      case 'MAJOR':
        return (
          inform.targetUsers?.some(
            (
              majorId, // 修改：targetIds -> targetUsers
            ) => user.major?._id.equals(majorId),
          ) || false
        );
      case 'ACADEMIC_CLASS':
        return (
          inform.targetUsers?.some(
            (
              classId, // 修改：targetIds -> targetUsers
            ) => user.academicClass?._id.equals(classId),
          ) || false
        );
      case 'SENDER_OWN_CLASS':
        const senderOfInform = await this.usersService.findOneById(
          inform.sender.toString(), // 修改：senderId -> sender
        );
        return (
          !!senderOfInform?.academicClass &&
          senderOfInform.academicClass._id.equals(user.academicClass?._id)
        );
      case 'SENDER_MANAGED_CLASSES':
        return false;
      case 'SENDER_COLLEGE_STUDENTS':
        const senderOfInformForCollege = await this.usersService.findOneById(
          inform.sender.toString(),
        );
        return (
          !!senderOfInformForCollege?.college &&
          senderOfInformForCollege.college._id.equals(user.college?._id)
        );

      default:
        return false;
    }
  }

  async findOneById(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<InformDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid MongoDB ObjectId format.');
    }
    const inform = await this.informModel
      .findById(id)
      // .populate('senderId', 'username profileImageUrl') // Example population
      // .populate('targetIds') // Populate if targetIds are refs to other collections
      .exec();

    if (!inform) {
      throw new NotFoundException(`Inform with ID "${id}" not found.`);
    }

    // 1. Check if the inform is public
    if (inform.isPublic) {
      return inform;
    }

    // 2. Check if the current user is the sender
    const currentUserId = new Types.ObjectId(currentUser._id); // Assuming currentUser._id is string
    if (
      transformObjectId(inform.sender).equals(transformObjectId(currentUserId))
    ) {
      return inform;
    }

    // 3. Check if the current user is a target recipient
    const isTarget = await this.isUserTargetOfInform(currentUserId, inform);
    if (isTarget) {
      return inform;
    }

    // 4. If none of the above, the user is forbidden to access this inform
    throw new ForbiddenException(
      'You do not have permission to access this resource.',
    );
  }

  // 删除草稿通知
  async deleteDraft(
    informId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    const inform = await this.informModel.findById(informId);

    if (!inform) {
      throw new NotFoundException(`通知 ID '${informId}' 未找到。`);
    }

    if (inform.status !== 'draft') {
      throw new BadRequestException(`只能删除草稿状态的通知。`);
    }

    // 修改deleteDraft方法中的权限检查
    // 确保只有通知的创建者才能删除
    if (
      !transformObjectId(inform.sender).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限删除此通知草稿。');
    }

    await this.informModel.findByIdAndDelete(informId);
    this.logger.log(`通知草稿 ${informId} 已被用户 ${currentUser._id} 删除。`);
  }

  // 撤销已发布的通知
  async revokePublishedInform(
    informId: string,
    currentUser: AuthenticatedUser,
  ): Promise<InformDocument> {
    const inform = await this.informModel.findById(informId);

    if (!inform) {
      throw new NotFoundException(`通知 ID '${informId}' 未找到。`);
    }

    if (inform.status !== 'published') {
      throw new BadRequestException(`只能撤销已发布状态的通知。`);
    }

    // 修改revokePublishedInform方法中的权限检查
    // 确保只有通知的创建者才能撤销
    if (
      !transformObjectId(inform.sender).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限撤销此通知。');
    }

    // 更新通知状态为草稿
    inform.status = 'draft';
    inform.lastRevokeAt = new Date();

    const updatedInform = await inform.save();

    // 删除所有收件人的回执记录
    await this.informReceiptModel.deleteMany({ inform: informId });

    this.logger.log(`通知 ${informId} 已被用户 ${currentUser._id} 撤销发布。`);

    return updatedInform;
  }

  // 归档已发布的通知
  async archivePublishedInform(
    informId: string,
    currentUser: AuthenticatedUser,
  ): Promise<InformDocument> {
    const inform = await this.informModel.findById(informId);

    if (!inform) {
      throw new NotFoundException(`通知 ID '${informId}' 未找到。`);
    }

    if (inform.status !== 'published') {
      throw new BadRequestException(`只能归档已发布状态的通知。`);
    }

    // 修改archivePublishedInform方法中的权限检查
    // 确保只有通知的创建者才能归档
    if (
      !transformObjectId(inform.sender).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限归档此通知。');
    }

    // 更新通知状态为归档
    inform.status = 'archived';
    inform.archivedAt = new Date();

    const updatedInform = await inform.save();
    this.logger.log(`通知 ${informId} 已被用户 ${currentUser._id} 归档。`);

    return updatedInform;
  }

  /**
   * 通过回执ID获取通知详情
   * @param receiptId 回执ID
   * @param currentUser 当前用户
   */
  async getReceiptById(receiptId: string, currentUser: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(receiptId)) {
      throw new BadRequestException('无效的回执ID格式');
    }

    const receipt = await this.informReceiptModel
      .findById(receiptId)
      .populate({
        path: 'inform',
        populate: {
          path: 'sender', // 这里没有问题，因为Inform模型中已经是sender
          select: 'username nickname realname avatar',
        },
      })
      .exec();

    if (!receipt) {
      throw new NotFoundException(`ID为"${receiptId}"的通知回执未找到`);
    }

    // 检查权限 - 只允许查看自己的通知回执
    if (
      !transformObjectId(receipt.user).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限查看此通知');
    }

    return receipt;
  }

  /**
   * 标记通知为已读
   * @param receiptId 回执ID
   * @param currentUser 当前用户
   */
  async markAsRead(receiptId: string, currentUser: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(receiptId)) {
      throw new BadRequestException('无效的回执ID格式');
    }

    const receipt = await this.informReceiptModel.findById(receiptId);

    if (!receipt) {
      throw new NotFoundException(`ID为"${receiptId}"的通知回执未找到`);
    }

    // 检查权限
    if (
      !transformObjectId(receipt.user).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限操作此通知');
    }

    // 已读则不需要更新
    if (receipt.isRead) {
      return receipt;
    }

    // 更新为已读
    receipt.isRead = true;
    receipt.readAt = new Date();
    await receipt.save();

    this.logger.log(`用户 ${currentUser._id} 已标记通知 ${receiptId} 为已读`);

    return receipt;
  }

  /**
   * 设置通知置顶状态
   * @param receiptId 回执ID
   * @param isPinned 是否置顶
   * @param currentUser 当前用户
   */
  async togglePin(
    receiptId: string,
    isPinned: boolean,
    currentUser: AuthenticatedUser,
  ) {
    if (!Types.ObjectId.isValid(receiptId)) {
      throw new BadRequestException('无效的回执ID格式');
    }

    const receipt = await this.informReceiptModel.findById(receiptId);

    if (!receipt) {
      throw new NotFoundException(`ID为"${receiptId}"的通知回执未找到`);
    }

    // 检查权限
    if (
      !transformObjectId(receipt.user).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限操作此通知');
    }

    // 更新置顶状态
    receipt.isPinned = isPinned;
    await receipt.save();

    this.logger.log(
      `用户 ${currentUser._id} 已${isPinned ? '置顶' : '取消置顶'}通知 ${receiptId}`,
    );

    return receipt;
  }

  /**
   * 标记通知为未读
   * @param receiptId 回执ID
   * @param currentUser 当前用户
   */
  async markAsUnread(receiptId: string, currentUser: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(receiptId)) {
      throw new BadRequestException('无效的回执ID格式');
    }

    const receipt = await this.informReceiptModel.findById(receiptId);

    if (!receipt) {
      throw new NotFoundException(`ID为"${receiptId}"的通知回执未找到`);
    }

    // 检查权限
    if (
      !transformObjectId(receipt.user).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限操作此通知');
    }

    // 未读则不需要更新
    if (!receipt.isRead) {
      return receipt;
    }

    // 更新为未读
    receipt.isRead = false;
    receipt.readAt = undefined; // 清除已读时间
    await receipt.save();

    this.logger.log(`用户 ${currentUser._id} 已标记通知 ${receiptId} 为未读`);

    return receipt;
  }

  /**
   * 删除用户的通知回执
   * @param receiptId 回执ID
   * @param currentUser 当前用户
   */
  async deleteReceipt(receiptId: string, currentUser: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(receiptId)) {
      throw new BadRequestException('无效的回执ID格式');
    }

    const receipt = await this.informReceiptModel.findById(receiptId);

    if (!receipt) {
      throw new NotFoundException(`ID为"${receiptId}"的通知回执未找到`);
    }

    // 检查权限
    if (
      !transformObjectId(receipt.user).equals(
        transformObjectId(currentUser._id),
      )
    ) {
      throw new ForbiddenException('您没有权限删除此通知');
    }

    await this.informReceiptModel.findByIdAndDelete(receiptId);

    this.logger.log(`用户 ${currentUser._id} 已删除通知回执 ${receiptId}`);

    return true;
  }

  /**
   * 获取用户的未读通知数量
   * @param userId 用户ID
   * @returns 未读通知数量
   */
  async getUnreadCountForUser(userId: Types.ObjectId): Promise<number> {
    this.logger.debug(`获取用户 ${userId} 的未读通知数`);

    const count = await this.informReceiptModel
      .countDocuments({
        user: userId,
        isRead: false,
      })
      .exec();

    this.logger.debug(`用户 ${userId} 的未读通知数: ${count}`);

    return count;
  }
}
