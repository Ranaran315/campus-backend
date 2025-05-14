import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

export const transformObjectId = (
  id: string | Types.ObjectId,
  fieldName: string = 'ID',
): Types.ObjectId => {
  if (typeof id === 'string') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`无效的 ${fieldName} 格式: ${id}`);
    }
    return new Types.ObjectId(id);
  }
  // 如果已经是 ObjectId，直接返回
  if (id instanceof Types.ObjectId) {
    return id;
  }
  // 处理其他意外情况，尽管类型定义限制了它
  throw new BadRequestException(
    `提供的 ${fieldName} 不是有效的字符串或 ObjectId: ${id}`,
  );
};
