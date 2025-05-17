import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
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
import { UsersService } from '../users/users.service';
import { CollegeService } from '../college/college.service';
import { MajorService } from '../major/major.service';
import { AcademicClassService } from '../academic-class/academic-class.service';
import { RoleService } from '../role/role.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserDocument } from '../users/schemas/user.schema'; // Keep for internal use like _executePublishActions
import {
  GetInformsQueryDto,
  InformSortByQuery,
  InformStatusQuery,
  SortOrderQuery,
} from './dto/get-informs-query.dto';
import { PaginatedResponse } from '../types/paginated-response.interface'; // Corrected path

// Define the PopulatedInformReceipt interface
export interface PopulatedInformReceipt
  extends Omit<InformReceiptDocument, 'informId'> {
  informId: InformDocument | null;
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

  // --- 核心业务逻辑方法将在这里实现 ---
  async create(
    createInformDto: CreateInformDto,
    senderAuth: AuthenticatedUser, // Changed from UserDocument to AuthenticatedUser
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
    const newInform = new this.informModel({
      ...createInformDto,
      senderId: senderDoc._id, // Use senderDoc._id
      status: 'draft',
    });
    const savedInform = await newInform.save();
    this.logger.log(
      `Inform draft created successfully with ID: ${savedInform._id}`,
    );
    return savedInform;
  }

  async publish(
    informId: string,
    publisherAuth: AuthenticatedUser, // Changed from UserDocument to AuthenticatedUser
  ): Promise<InformDocument> {
    const publisherDoc = await this.usersService.findOneById(publisherAuth._id);
    if (!publisherDoc) {
      throw new NotFoundException(
        `Publisher with ID '${publisherAuth._id}' not found.`,
      );
    }
    this.logger.log(
      `Attempting to publish inform ID: ${informId} by publisher: ${publisherDoc.username}`,
    );

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

    // Ensure publisher is the original sender
    if (informToPublish.senderId.toString() !== publisherDoc._id.toString()) {
      // It was publisher._id before, now it's publisherDoc._id
      throw new BadRequestException('您没有权限发布此通知草稿。');
    }

    // The originalSender for _executePublishActions is the publisherDoc in this context,
    // as only the original sender can publish their own draft.
    const originalSenderDoc = publisherDoc;

    // 更新状态和发布时间
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

  async createAndPublish(
    createInformDto: CreateInformDto,
    senderAuth: AuthenticatedUser, // Changed from UserDocument to AuthenticatedUser
  ): Promise<InformDocument> {
    const senderDoc = await this.usersService.findOneById(senderAuth._id);
    if (!senderDoc) {
      throw new NotFoundException(
        `Sender with ID '${senderAuth._id}' not found.`,
      );
    }
    this.logger.log(
      `Attempting to create and publish inform by sender: ${senderDoc.username}`,
    );

    const informData: Partial<Inform> = {
      ...createInformDto,
      senderId: senderDoc._id, // Use senderDoc._id
      status: 'published',
      publishAt: new Date(),
    };

    const newInform = new this.informModel(informData);
    const savedPublishedInform = await newInform.save();

    this.logger.log(
      `Inform document created with ID: ${savedPublishedInform._id} and status: 'published'`,
    );

    // 执行公共的发布操作，此时的 senderDoc 就是 originalSender
    await this._executePublishActions(savedPublishedInform, senderDoc);

    this.logger.log(
      `Inform ID: ${savedPublishedInform._id} created and published successfully.`,
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
    const { targetType, targetIds, userTypeFilter } = informDoc;

    // In _executePublishActions, originalSenderDoc is used directly.
    // The logic for SENDER_* cases should use originalSenderDoc.
    // For example:
    // case 'SENDER_OWN_CLASS':
    //   if (
    //     originalSenderDoc.userType !== 'student' ||
    //     !originalSenderDoc.academicClass
    //   ) { ... }
    //   targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
    //     [originalSenderDoc.academicClass.toString()],
    //      userTypeFilter,
    //   );
    //   break;
    // Ensure all SENDER_* cases correctly use originalSenderDoc

    switch (targetType) {
      case 'ALL':
        targetUserIds =
          await this.usersService.findAllUserIdsByFilter(userTypeFilter);
        break;
      case 'ROLE':
        if (!targetIds || targetIds.length === 0) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：角色目标类型必须提供角色ID列表。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByRoleIds(
          targetIds,
          userTypeFilter,
        );
        break;
      case 'COLLEGE':
        if (!targetIds || targetIds.length === 0) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：学院目标类型必须提供学院ID列表。`,
          );
        }
        for (const collegeId of targetIds) {
          const college = await this.collegeService.findOne(collegeId);
          if (!college)
            throw new NotFoundException(
              `发布通知 ${informDoc._id} 失败：学院ID '${collegeId}' 不存在。`,
            );
        }
        targetUserIds = await this.usersService.findUserIdsByCollegeIds(
          targetIds,
          userTypeFilter,
        );
        break;
      case 'MAJOR':
        if (!targetIds || targetIds.length === 0) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：专业目标类型必须提供专业ID列表。`,
          );
        }
        for (const majorId of targetIds) {
          const major = await this.majorService.findOne(majorId);
          if (!major)
            throw new NotFoundException(
              `发布通知 ${informDoc._id} 失败：专业ID '${majorId}' 不存在。`,
            );
        }
        targetUserIds = await this.usersService.findUserIdsByMajorIds(
          targetIds,
          userTypeFilter,
        );
        break;
      case 'ACADEMIC_CLASS':
        if (!targetIds || targetIds.length === 0) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：班级目标类型必须提供班级ID列表。`,
          );
        }
        for (const classId of targetIds) {
          const academicClass =
            await this.academicClassService.findOne(classId);
          if (!academicClass)
            throw new NotFoundException(
              `发布通知 ${informDoc._id} 失败：班级ID '${classId}' 不存在。`,
            );
        }
        targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
          targetIds,
          userTypeFilter,
        );
        break;
      case 'SPECIFIC_USERS':
        if (!targetIds || targetIds.length === 0) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：特定用户目标类型必须提供用户ID列表。`,
          );
        }
        const users = await this.usersService.findUsersByIds(
          targetIds.map((id) => new Types.ObjectId(id)),
        );
        if (users.length !== targetIds.length) {
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
          `发布通知 ${informDoc._id} 失败：通知定义中的目标类型 '${targetType}' 无效。`,
        );
    }

    const uniqueUserIds = Array.from(
      new Set(targetUserIds.map((id) => id.toString())),
    ).map((idStr) => new Types.ObjectId(idStr));

    if (uniqueUserIds.length === 0) {
      this.logger.warn(
        `No target users found for publishing inform ID: ${informDoc._id}. The inform is published but has no recipients.`,
      );
      // Even if no recipients, the inform is considered published.
      // No need to return early or throw an error here unless specifically required.
    }

    if (uniqueUserIds.length > 0) {
      const receiptsToCreate = uniqueUserIds.map((userId) => ({
        informId: informDoc._id,
        userId: userId,
        status: 'unread', // Default status for new receipts
      }));
      try {
        await this.informReceiptModel.insertMany(receiptsToCreate, {
          ordered: false, // Continue inserting even if some fail (e.g., due to unique constraints if re-publishing logic changes)
        });
      } catch (error) {
        // Log error but don't let it break the entire publish flow if some receipts fail (e.g. duplicate for a user)
        this.logger.error(
          `Error bulk inserting receipts for inform ${informDoc._id}. Some might have failed. Error: ${error.message}`,
          error.writeErrors || error.stack,
        );
      }
    }

    // Send WebSocket notifications to the targeted users
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
    const {
      page = 1,
      limit = 10,
      status,
      importance,
      sortBy,
      sortOrder,
    } = queryDto;

    const findQuery: any = { userId };

    if (status && status !== InformStatusQuery.ALL) {
      findQuery.isRead = status === InformStatusQuery.READ;
    }

    if (importance) {
      // Find informs that match the importance
      const informsMatchingImportance = await this.informModel
        .find({ importance })
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
      findQuery.informId = { $in: informIdsFilteredByImportance };
    }

    const sortOptions: any = {};
    // For sorting by fields on the Inform document (like publishAt or importance),
    // an aggregation pipeline is generally more efficient.
    // Here, we'll sort after populating if such a sort is requested.
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

    // Fetch receipts
    const fetchedReceipts = await this.informReceiptModel
      .find(findQuery)
      .populate<{ informId: InformDocument | null }>({
        path: 'informId',
        model: Inform.name,
      })
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      // Not using .lean() here to ensure populated informId is a full Mongoose document for easier handling
      .exec();

    // Cast to PopulatedInformReceipt[]
    let processedReceipts: PopulatedInformReceipt[] =
      fetchedReceipts as unknown as PopulatedInformReceipt[];

    // Application-level sorting for fields on the populated Inform document
    if (sortBy === InformSortByQuery.PUBLISH_AT) {
      processedReceipts.sort((a, b) => {
        const dateA = a.informId?.publishAt?.getTime() || 0;
        const dateB = b.informId?.publishAt?.getTime() || 0;
        return sortOrder === SortOrderQuery.ASC ? dateA - dateB : dateB - dateA;
      });
    } else if (sortBy === InformSortByQuery.IMPORTANCE) {
      const importanceOrder = { high: 1, medium: 2, low: 3 };
      processedReceipts.sort((a, b) => {
        const importanceA = a.informId?.importance;
        const importanceB = b.informId?.importance;
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
        const deadlineA_time = a.informId?.deadline?.getTime();
        const deadlineB_time = b.informId?.deadline?.getTime();

        // Handle undefined/null deadlines: sort them to the end
        if (deadlineA_time == null && deadlineB_time == null) return 0; // both null, treat as equal
        if (deadlineA_time == null) return 1; // a is null, sort a after b (to the end)
        if (deadlineB_time == null) return -1; // b is null, sort a before b (b to the end)

        return sortOrder === SortOrderQuery.ASC
          ? deadlineA_time - deadlineB_time
          : deadlineB_time - deadlineA_time;
      });
    }

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
}
