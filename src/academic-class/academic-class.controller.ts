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
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { AcademicClassService } from './academic-class.service';
import { CreateAcademicClassDto } from './dto/create-academic-class.dto';
import { UpdateAcademicClassDto } from './dto/update-academic-class.dto';
import { Types } from 'mongoose';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('academic-classes') // Consistent plural naming
export class AcademicClassController {
  constructor(private readonly academicClassService: AcademicClassService) {}

  @Post()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @UseGuards(PermissionsGuard)
  @Permissions('academic_class:create')
  create(@Body() createAcademicClassDto: CreateAcademicClassDto) {
    return this.academicClassService.create(createAcademicClassDto);
  }

  @Get()
  findAll(
    @Query('collegeId') collegeId?: string,
    @Query('majorId') majorId?: string,
    @Query(
      'entryYear',
      new DefaultValuePipe(undefined),
      new ParseIntPipe({ optional: true }),
    )
    entryYear?: number,
  ) {
    if (collegeId && !Types.ObjectId.isValid(collegeId)) {
      throw new BadRequestException(`Invalid College ID format "${collegeId}"`);
    }
    if (majorId && !Types.ObjectId.isValid(majorId)) {
      throw new BadRequestException(`Invalid Major ID format "${majorId}"`);
    }
    return this.academicClassService.findAll(collegeId, majorId, entryYear);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Academic Class ID format "${id}"`);
    }
    return this.academicClassService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @UseGuards(PermissionsGuard)
  @Permissions('academic_class:update')
  update(
    @Param('id') id: string,
    @Body() updateAcademicClassDto: UpdateAcademicClassDto,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Academic Class ID format "${id}"`);
    }
    return this.academicClassService.update(id, updateAcademicClassDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @Permissions('academic_class:delete')
  async remove(@Param('id') id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid Academic Class ID format "${id}"`);
    }
    await this.academicClassService.remove(id);
  }
}
