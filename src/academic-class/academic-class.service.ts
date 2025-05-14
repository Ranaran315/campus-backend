import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AcademicClass,
  AcademicClassDocument,
} from './schemas/academic-class.schema';
import { CreateAcademicClassDto } from './dto/create-academic-class.dto';
import { UpdateAcademicClassDto } from './dto/update-academic-class.dto';
import { Major, MajorDocument } from '../major/schemas/major.schema';
import { User, UserDocument } from '../users/user.schema'; // Corrected path
import { College, CollegeDocument } from '../college/schemas/college.schema';

@Injectable()
export class AcademicClassService {
  constructor(
    @InjectModel(AcademicClass.name)
    private academicClassModel: Model<AcademicClassDocument>,
    @InjectModel(Major.name) private majorModel: Model<MajorDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    // CollegeModel is not strictly needed here if college is always derived from major
    // @InjectModel(College.name) private collegeModel: Model<CollegeDocument>,
  ) {}

  async create(
    createAcademicClassDto: CreateAcademicClassDto,
  ): Promise<AcademicClass> {
    const {
      major: majorId,
      counselor: counselorId,
      classMonitor: classMonitorId,
      ...restDto
    } = createAcademicClassDto;

    // 1. Validate Major and derive College
    if (!Types.ObjectId.isValid(majorId)) {
      throw new BadRequestException(`Invalid Major ID format "${majorId}"`);
    }
    // Ensure college is populated to get its ID
    const major = await this.majorModel
      .findById(majorId)
      .populate('college')
      .exec();
    if (!major) {
      throw new BadRequestException(`Major with ID "${majorId}" not found.`);
    }
    // After populate, major.college should be a CollegeDocument or its ObjectId if not populated correctly
    if (!major.college || !(major.college as CollegeDocument)._id) {
      throw new BadRequestException(
        `College information is missing or invalid for Major ID "${majorId}". Ensure the major has an associated college.`,
      );
    }
    const collegeObjectId = (major.college as CollegeDocument)._id;

    // 2. Validate Counselor if provided
    let counselor: UserDocument | null = null;
    if (counselorId) {
      if (!Types.ObjectId.isValid(counselorId)) {
        throw new BadRequestException(
          `Invalid Counselor ID format "${counselorId}"`,
        );
      }
      counselor = await this.userModel.findById(counselorId).exec();
      if (!counselor) {
        throw new BadRequestException(
          `Counselor (User) with ID "${counselorId}" not found.`,
        );
      }
    }

    // 3. Validate Class Monitor if provided
    let classMonitor: UserDocument | null = null;
    if (classMonitorId) {
      if (!Types.ObjectId.isValid(classMonitorId)) {
        throw new BadRequestException(
          `Invalid Class Monitor ID format "${classMonitorId}"`,
        );
      }
      classMonitor = await this.userModel.findById(classMonitorId).exec();
      if (!classMonitor) {
        throw new BadRequestException(
          `Class Monitor (User) with ID "${classMonitorId}" not found.`,
        );
      }
    }

    const academicClassData = {
      ...restDto,
      major: new Types.ObjectId(majorId),
      college: collegeObjectId, // Use the derived ObjectId
      counselor: counselor ? counselor._id : undefined,
      classMonitor: classMonitor ? classMonitor._id : undefined,
    };

    try {
      const createdAcademicClass = new this.academicClassModel(
        academicClassData,
      );
      return await createdAcademicClass.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Academic class name already exists for this major and entry year.',
        );
      }
      throw error;
    }
  }

  async findAll(
    collegeId?: string,
    majorId?: string,
    entryYear?: number,
  ): Promise<AcademicClass[]> {
    const query: any = {};
    if (collegeId) {
      if (!Types.ObjectId.isValid(collegeId)) {
        throw new BadRequestException(
          `Invalid College ID format "${collegeId}"`,
        );
      }
      query.college = new Types.ObjectId(collegeId);
    }
    if (majorId) {
      if (!Types.ObjectId.isValid(majorId)) {
        throw new BadRequestException(`Invalid Major ID format "${majorId}"`);
      }
      query.major = new Types.ObjectId(majorId);
    }
    if (entryYear) {
      query.entryYear = entryYear;
    }
    return this.academicClassModel
      .find(query)
      .populate('major', 'name majorId college') // Ensure college is populated in major if needed downstream
      .populate('college', 'name collegeId')
      .populate('counselor', 'username name email')
      .populate('classMonitor', 'username name email')
      .exec();
  }

  async findOne(id: string | Types.ObjectId): Promise<AcademicClass> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Academic Class ID format "${id}"`);
    }
    const academicClass = await this.academicClassModel
      .findById(id)
      .populate('major', 'name majorId college')
      .populate('college', 'name collegeId')
      .populate('counselor', 'username name email')
      .populate('classMonitor', 'username name email')
      .exec();
    if (!academicClass) {
      throw new NotFoundException(`Academic Class with ID "${id}" not found`);
    }
    return academicClass;
  }

  async update(
    id: string,
    updateAcademicClassDto: UpdateAcademicClassDto,
  ): Promise<AcademicClass> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Academic Class ID format "${id}"`);
    }

    const existingClass = await this.academicClassModel.findById(id);
    if (!existingClass) {
      throw new NotFoundException(`Academic Class with ID "${id}" not found`);
    }

    const {
      major: newMajorId,
      counselor: newCounselorId,
      classMonitor: newClassMonitorId,
      ...restUpdateDto
    } = updateAcademicClassDto;

    const updateData: any = { ...restUpdateDto };

    // If major is being updated, also update the derived college
    if (newMajorId) {
      if (!Types.ObjectId.isValid(newMajorId)) {
        throw new BadRequestException(
          `Invalid new Major ID format "${newMajorId}"`,
        );
      }
      const major = await this.majorModel
        .findById(newMajorId)
        .populate('college')
        .exec();
      if (!major) {
        throw new BadRequestException(
          `New Major with ID "${newMajorId}" not found.`,
        );
      }
      if (!major.college || !(major.college as CollegeDocument)._id) {
        throw new BadRequestException(
          `College information is missing or invalid for new Major ID "${newMajorId}".`,
        );
      }
      updateData.major = new Types.ObjectId(newMajorId);
      updateData.college = (major.college as CollegeDocument)._id; // Update college ObjectId
    }

    // Handle counselor update (allow setting to null)
    if (newCounselorId !== undefined) {
      if (newCounselorId === null) {
        updateData.counselor = null;
      } else if (Types.ObjectId.isValid(newCounselorId)) {
        const counselor = await this.userModel.findById(newCounselorId).exec();
        if (!counselor) {
          throw new BadRequestException(
            `New Counselor (User) with ID "${newCounselorId}" not found.`,
          );
        }
        updateData.counselor = counselor._id;
      } else {
        throw new BadRequestException(
          `Invalid new Counselor ID format "${newCounselorId}"`,
        );
      }
    }

    // Handle class monitor update (allow setting to null)
    if (newClassMonitorId !== undefined) {
      if (newClassMonitorId === null) {
        updateData.classMonitor = null;
      } else if (Types.ObjectId.isValid(newClassMonitorId)) {
        const classMonitor = await this.userModel
          .findById(newClassMonitorId)
          .exec();
        if (!classMonitor) {
          throw new BadRequestException(
            `New Class Monitor (User) with ID "${newClassMonitorId}" not found.`,
          );
        }
        updateData.classMonitor = classMonitor._id;
      } else {
        throw new BadRequestException(
          `Invalid new Class Monitor ID format "${newClassMonitorId}"`,
        );
      }
    }

    try {
      const updatedAcademicClass = await this.academicClassModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .populate('major', 'name majorId college')
        .populate('college', 'name collegeId')
        .populate('counselor', 'username name email')
        .populate('classMonitor', 'username name email')
        .exec();
      // The findByIdAndUpdate with {new: true} should return the updated doc or null if not found.
      // The existingClass check above should prevent null here if ID is valid.
      if (!updatedAcademicClass) {
        throw new NotFoundException(
          `Academic Class with ID "${id}" not found after update attempt, though it existed before.`,
        );
      }
      return updatedAcademicClass;
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Academic class name already exists for this major and entry year.',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ deleted: boolean; message?: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Academic Class ID format "${id}"`);
    }
    // TODO: Add logic to check if there are Students (Users) associated with this AcademicClass before deletion
    const result = await this.academicClassModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Academic Class with ID "${id}" not found`);
    }
    return { deleted: true };
  }
}
