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
} from '@nestjs/common';
import { CollegeService } from './college.service';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
// import { Roles } from '../auth/decorators/roles.decorator'; // 假设的装饰器路径
// import { Permissions } from '../auth/decorators/permissions.decorator'; // 假设的装饰器路径
// import { AuthGuard } from '@nestjs/passport'; // 如果需要JWT认证
// import { RolesGuard } from '../auth/guards/roles.guard'; // 假设的守卫路径
// import { PermissionsGuard } from '../auth/guards/permissions.guard'; // 假设的守卫路径

@Controller('colleges') // 路由前缀统一为复数形式
// @UseGuards(AuthGuard('jwt'), RolesGuard, PermissionsGuard) // 示例：全局应用守卫
export class CollegeController {
  constructor(private readonly collegeService: CollegeService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  // @Roles('SuperAdmin', 'Admin') // 示例：特定角色才能创建
  // @Permissions('college:create') // 示例：特定权限才能创建
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
  // @Roles('SuperAdmin', 'Admin')
  // @Permissions('college:update')
  update(@Param('id') id: string, @Body() updateCollegeDto: UpdateCollegeDto) {
    return this.collegeService.update(id, updateCollegeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  // @Roles('SuperAdmin')
  // @Permissions('college:delete')
  async remove(@Param('id') id: string) {
    await this.collegeService.remove(id);
    return; // For 204 No Content
  }
}
