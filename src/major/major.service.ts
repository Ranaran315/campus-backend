import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Major, MajorDocument } from './schemas/major.schema';
import { CreateMajorDto } from './dto/create-major.dto';
import { UpdateMajorDto } from './dto/update-major.dto';
import { College, CollegeDocument } from '../college/schemas/college.schema'; // 确保路径正确

@Injectable()
export class MajorService {
  constructor(
    @InjectModel(Major.name) private majorModel: Model<MajorDocument>,
    @InjectModel(College.name) private collegeModel: Model<CollegeDocument>, // 注入 College 模型用于校验
  ) {}

  async create(createMajorDto: CreateMajorDto): Promise<Major> {
    // 验证学院是否存在
    const collegeExists = await this.collegeModel
      .findById(createMajorDto.college)
      .exec();
    if (!collegeExists) {
      throw new BadRequestException(
        `College with ID "${createMajorDto.college}" not found.`,
      );
    }

    try {
      const createdMajor = new this.majorModel(createMajorDto);
      return await createdMajor.save();
    } catch (error) {
      // 处理可能的唯一索引冲突 (例如，同一学院下专业名称重复)
      if (error.code === 11000) {
        throw new BadRequestException(
          'Major name already exists within the specified college.',
        );
      }
      throw error;
    }
  }

  async findAll(collegeId?: string): Promise<Major[]> {
    const query: any = {};
    if (collegeId) {
      if (!Types.ObjectId.isValid(collegeId)) {
        throw new BadRequestException(
          `Invalid College ID format "${collegeId}"`,
        );
      }
      query.college = new Types.ObjectId(collegeId);
    }
    return this.majorModel.find(query).populate('college').exec();
  }

  async findOne(id: string): Promise<Major> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Major ID format "${id}"`);
    }
    const major = await this.majorModel.findById(id).populate('college').exec();
    if (!major) {
      throw new NotFoundException(`Major with ID "${id}" not found`);
    }
    return major;
  }

  async update(id: string, updateMajorDto: UpdateMajorDto): Promise<Major> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Major ID format "${id}"`);
    }
    if (updateMajorDto.college) {
      if (!Types.ObjectId.isValid(updateMajorDto.college)) {
        throw new BadRequestException(
          `Invalid College ID format "${updateMajorDto.college}"`,
        );
      }
      const collegeExists = await this.collegeModel
        .findById(updateMajorDto.college)
        .exec();
      if (!collegeExists) {
        throw new BadRequestException(
          `College with ID "${updateMajorDto.college}" not found.`,
        );
      }
    }
    try {
      const existingMajor = await this.majorModel
        .findByIdAndUpdate(id, updateMajorDto, { new: true })
        .populate('college')
        .exec();
      if (!existingMajor) {
        throw new NotFoundException(`Major with ID "${id}" not found`);
      }
      return existingMajor;
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Major name already exists within the specified college.',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ deleted: boolean; message?: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Major ID format "${id}"`);
    }
    // TODO: Add logic to check if there are AcademicClasses associated with this Major before deletion
    const result = await this.majorModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Major with ID "${id}" not found`);
    }
    return { deleted: true };
  }
}
