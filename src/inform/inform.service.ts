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

    const newInform = new this.informModel({
      ...createInformDto,
      deadline: deadlineDate,
      senderId: senderDoc._id, // Use senderDoc._id
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

    // 确保发布人是通知的原始发送者
    if (informToPublish.senderId.toString() !== publisherDoc._id.toString()) {
      throw new BadRequestException('您没有权限发布此通知草稿。');
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
    const { targetScope, targetIds, userTypeFilter } = informDoc;

    switch (targetScope) {
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

    const query: any = { senderId: userId };

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
          inform.targetIds?.some((targetId) => transformObjectId(targetId).equals(userId)) || false
        );
      case 'ROLE':
        return (
          inform.targetIds?.some((roleId) =>
            user.roles.some(
              (userRole) =>
                (userRole as any)._id?.equals(roleId) || userRole === transformObjectId(roleId),
            ),
          ) || false
        );
      case 'COLLEGE':
        return (
          inform.targetIds?.some((collegeId) =>
            user.college?._id.equals(collegeId),
          ) || false
        );
      case 'MAJOR':
        return (
          inform.targetIds?.some((majorId) =>
            user.major?._id.equals(majorId),
          ) || false
        );
      case 'ACADEMIC_CLASS':
        return (
          inform.targetIds?.some((classId) =>
            user.academicClass?._id.equals(classId),
          ) || false
        );
      case 'SENDER_OWN_CLASS':
        const senderOfInform = await this.usersService.findOneById(
          inform.senderId.toString(),
        );
        return (
          !!senderOfInform?.academicClass &&
          senderOfInform.academicClass._id.equals(user.academicClass?._id)
        );
      case 'SENDER_MANAGED_CLASSES':
        return false;
      case 'SENDER_COLLEGE_STUDENTS':
        const senderOfInformForCollege = await this.usersService.findOneById(
          inform.senderId.toString(),
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
    if (inform.senderId.equals(currentUserId)) {
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
}
