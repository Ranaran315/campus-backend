import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { College, CollegeDocument } from './schemas/college.schema';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class CollegeService {
  constructor(
    @InjectModel(College.name) private collegeModel: Model<CollegeDocument>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async create(createCollegeDto: CreateCollegeDto): Promise<College> {
    const createdCollege = new this.collegeModel(createCollegeDto);
    return createdCollege.save();
  }

  async findAll(): Promise<College[]> {
    return this.collegeModel.find().exec();
  }

  async findOne(id: string | Types.ObjectId): Promise<College> {
    const college = await this.collegeModel.findById(id).exec();
    if (!college) {
      throw new NotFoundException(`College with ID "${id}" not found`);
    }
    return college;
  }

  async update(
    id: string,
    updateCollegeDto: UpdateCollegeDto,
  ): Promise<College> {
    const existingCollege = await this.collegeModel
      .findByIdAndUpdate(id, updateCollegeDto, { new: true })
      .exec();
    if (!existingCollege) {
      throw new NotFoundException(`College with ID "${id}" not found`);
    }
    return existingCollege;
  }

  async remove(id: string): Promise<{ deleted: boolean; message?: string }> {
    // TODO: Add logic to check if there are Majors associated with this College before deletion
    // For now, direct delete:
    const result = await this.collegeModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`College with ID "${id}" not found`);
    }
    return { deleted: true };
  }

  // --- 获取学院人员分布统计 ---
  async getCollegeDistribution(): Promise<{ name: string; studentCount: number; staffCount: number }[]> {
    const colleges = await this.collegeModel.find().exec();
    const users = await this.usersService.findAll();
    
    const distribution = colleges.map(college => {
      const collegeUsers = users.filter(user => 
        // @ts-ignore
        user.college && user.college.toString() === college._id.toString()
      );
      
      return {
        name: college.name,
        studentCount: collegeUsers.filter(user => user.userType === 'student').length,
        staffCount: collegeUsers.filter(user => user.userType === 'staff').length
      };
    });
    
    return distribution;
  }
}
