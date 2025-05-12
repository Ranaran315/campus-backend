import { Types } from "mongoose";

export const transformObjectId = (id: string | Types.ObjectId): Types.ObjectId => {
    return typeof id === 'string' ? new Types.ObjectId(id) : id;
}