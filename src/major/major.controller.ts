import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { MajorService } from './major.service';
import { CreateMajorDto } from './dto/create-major.dto';
import { UpdateMajorDto } from './dto/update-major.dto';
import { Types } from 'mongoose';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('majors')
export class MajorController {
  constructor(private readonly majorService: MajorService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseGuards(PermissionsGuard)
  @Permissions('major:create')
  create(@Body() createMajorDto: CreateMajorDto) {
    return this.majorService.create(createMajorDto);
  }

  @Get()
  findAll(@Query('collegeId') collegeId?: string) {
    if (collegeId && !Types.ObjectId.isValid(collegeId)) {
      throw new BadRequestException(`Invalid College ID format "${collegeId}"`);
    }
    return this.majorService.findAll(collegeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Major ID format "${id}"`);
    }
    return this.majorService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseGuards(PermissionsGuard)
  @Permissions('major:update')
  update(@Param('id') id: string, @Body() updateMajorDto: UpdateMajorDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Major ID format "${id}"`);
    }
    return this.majorService.update(id, updateMajorDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @Permissions('major:delete')
  async remove(@Param('id') id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Major ID format "${id}"`);
    }
    await this.majorService.remove(id);
  }
}
