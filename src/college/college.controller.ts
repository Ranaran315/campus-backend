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
  UseGuards,
} from '@nestjs/common';
import { CollegeService } from './college.service';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Import JwtAuthGuard

@Controller('colleges')
@UseGuards(JwtAuthGuard)
export class CollegeController {
  constructor(private readonly collegeService: CollegeService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseGuards(PermissionsGuard) // PermissionsGuard will run after JwtAuthGuard (implicitly, due to order of execution)
  @Permissions('college:create')
  create(@Body() createCollegeDto: CreateCollegeDto) {
    return this.collegeService.create(createCollegeDto);
  }

  @Get()
  findAll() {
    return this.collegeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.collegeService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseGuards(PermissionsGuard)
  @Permissions('college:update')
  update(@Param('id') id: string, @Body() updateCollegeDto: UpdateCollegeDto) {
    return this.collegeService.update(id, updateCollegeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @Permissions('college:delete')
  async remove(@Param('id') id: string) {
    await this.collegeService.remove(id);
    // return; // For 204 No Content - this is implicit if method returns void/Promise<void> and @HttpCode(204) is set
  }
}
