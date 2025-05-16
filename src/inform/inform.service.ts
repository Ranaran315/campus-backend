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
import { CreateInformDto } from './dto/create-inform.dto'; // 稍后创建
// import { UpdateInformDto } from './dto/update-inform.dto'; // 稍后创建
// import { CreateInformCommentDto } from './dto/create-inform-comment.dto'; // 稍后创建
import { UsersService } from '../users/users.service';
import { CollegeService } from '../college/college.service';
import { MajorService } from '../major/major.service';
import { AcademicClassService } from '../academic-class/academic-class.service';
import { RoleService } from '../role/role.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { UserDocument } from '../users/user.schema'; // 引入 UserDocument

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
    sender: UserDocument,
  ): Promise<InformDocument> {
    this.logger.log(
      `Attempting to create inform DRAFT by sender: ${sender.username}`,
    );
    const newInform = new this.informModel({
      ...createInformDto,
      senderId: sender._id,
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
    publisher: UserDocument,
  ): Promise<InformDocument> {
    this.logger.log(
      `Attempting to publish inform ID: ${informId} by publisher: ${publisher.username}`,
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

    if (informToPublish.senderId.toString() !== publisher._id.toString()) {
      throw new BadRequestException('您没有权限发布此通知草稿。');
    }

    // 获取原始发送者信息，用于解析 SENDER_* 类型的目标
    const originalSender = await this.usersService.findOneById(
      informToPublish.senderId,
    );
    if (!originalSender) {
      throw new NotFoundException(
        `原始发送者 ID '${informToPublish.senderId}' 未找到，无法解析 SENDER_* 类型的目标。`,
      );
    }

    // 更新状态和发布时间
    informToPublish.status = 'published';
    informToPublish.publishAt = new Date();
    const savedPublishedInform = await informToPublish.save();

    // 执行公共的发布操作
    await this._executePublishActions(savedPublishedInform, originalSender);

    this.logger.log(
      `Inform ID: ${savedPublishedInform._id} published successfully.`,
    );
    return savedPublishedInform;
  }

  async createAndPublish(
    createInformDto: CreateInformDto,
    sender: UserDocument, // 在此场景下，sender 即为 originalSender
  ): Promise<InformDocument> {
    this.logger.log(
      `Attempting to create and publish inform by sender: ${sender.username}`,
    );

    const informData: Partial<Inform> = {
      ...createInformDto,
      senderId: sender._id,
      status: 'published',
      publishAt: new Date(),
    };

    const newInform = new this.informModel(informData);
    const savedPublishedInform = await newInform.save();

    this.logger.log(
      `Inform document created with ID: ${savedPublishedInform._id} and status: 'published'`,
    );

    // 执行公共的发布操作，此时的 sender 就是 originalSender
    await this._executePublishActions(savedPublishedInform, sender);

    this.logger.log(
      `Inform ID: ${savedPublishedInform._id} created and published successfully.`,
    );
    return savedPublishedInform;
  }

  /**
   * @description 封装了发布通知时的核心动作：解析目标用户、创建回执、发送WebSocket。
   * @param informDoc 已保存的、状态为 'published' 的通知文档
   * @param originalSender 用于解析 SENDER_* 目标类型的原始发送者 UserDocument
   * @private
   */
  private async _executePublishActions(
    informDoc: InformDocument,
    originalSender: UserDocument, // 用于 SENDER_* 类型的上下文
  ): Promise<void> {
    let targetUserIds: Types.ObjectId[] = [];
    const { targetType, targetIds, userTypeFilter } = informDoc;

    switch (targetType) {
      case 'ALL':
        targetUserIds =
          await this.usersService.findAllUserIdsByFilter(userTypeFilter);
        break;
      case 'ROLE':
        if (!targetIds || targetIds.length === 0) {
          throw new BadRequestException( // 或者在这里记录错误并返回，避免中断整个流程
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
          // 可以选择记录日志并继续，或者抛出错误
          this.logger.warn(
            `发布通知 ${informDoc._id} 时，部分指定用户ID无效。`,
          );
        }
        targetUserIds = users.map((user) => user._id);
        break;
      case 'SENDER_OWN_CLASS':
        if (
          originalSender.userType !== 'student' ||
          !originalSender.academicClass
        ) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：原始发送者设置不适用于“发送者所在班级”目标类型。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
          [originalSender.academicClass.toString()],
          userTypeFilter,
        );
        break;
      case 'SENDER_MANAGED_CLASSES':
        if (
          originalSender.userType !== 'staff' ||
          !originalSender.staffInfo?.managedClasses ||
          originalSender.staffInfo.managedClasses.length === 0
        ) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：原始发送者设置不适用于“发送者管理的所有班级”目标类型。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByAcademicClassIds(
          originalSender.staffInfo.managedClasses.map((id) => id.toString()),
          userTypeFilter,
        );
        break;
      case 'SENDER_COLLEGE_STUDENTS':
        let senderCollegeId: Types.ObjectId | undefined;
        if (originalSender.userType === 'student' && originalSender.college) {
          senderCollegeId = originalSender.college;
        } else if (
          originalSender.userType === 'staff' &&
          originalSender.staffInfo?.department
        ) {
          senderCollegeId = originalSender.staffInfo.department;
        }
        if (!senderCollegeId) {
          throw new BadRequestException(
            `发布通知 ${informDoc._id} 失败：无法确定原始发送者所属学院。`,
          );
        }
        targetUserIds = await this.usersService.findUserIdsByCollegeIds(
          [senderCollegeId.toString()],
          'student',
        );
        break;
      default:
        throw new BadRequestException( // 或者记录错误
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
    }

    if (uniqueUserIds.length > 0) {
      const receiptsToCreate = uniqueUserIds.map((userId) => ({
        informId: informDoc._id,
        userId: userId,
      }));
      try {
        await this.informReceiptModel.insertMany(receiptsToCreate, {
          ordered: false,
        });
      } catch (error) {
        this.logger.error(
          `Error bulk inserting receipts for inform ${informDoc._id}. Some might have failed (e.g., duplicates).`,
          error.writeErrors || error,
        );
      }
    }

    // uniqueUserIds.forEach((userId) => {
    //   this.notificationsGateway.sendNewInformAlert(userId.toString(), {
    //     id: informDoc._id.toString(),
    //     title: informDoc.title,
    //     importance: informDoc.importance,
    //   });
    // });
    this.logger.log(
      `Finished publish actions for inform ID: ${informDoc._id} to ${uniqueUserIds.length} users.`,
    );
  }

  // ... (其他方法: getInformsForUser, getInformDetails, markAsRead, etc.)
}
