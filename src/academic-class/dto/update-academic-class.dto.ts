import { PartialType } from '@nestjs/mapped-types';
import { CreateAcademicClassDto } from './create-academic-class.dto';

export class UpdateAcademicClassDto extends PartialType(
  CreateAcademicClassDto,
) {}
