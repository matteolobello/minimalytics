import * as Mongoose from "mongoose"

const SCHEMA_NAME = "Log"

export interface ILog extends Mongoose.Document {
    ip: string,
    timestamp: Date,
    country: string
}

const createLogSchema = (collection: string) => {
    return new Mongoose.Schema(
        {
            ip: {
                type: String,
                unique: true,
                required: true,
                lowercase: true,
                trim: true
            },
            timestamp: {
                type: Date,
                required: true
            },
            country: {
                type: String,
                required: true,
                trim: true
            }
        },
        { collection }
    )
}

export const createLogModel = (mongoose: Mongoose.Mongoose, collection: string): Mongoose.Model<ILog> => {
    return mongoose.model<ILog>(SCHEMA_NAME, createLogSchema(collection))
}
