import { Schema, model, Document, Types } from "mongoose";

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  password?: string;
  googleId?: string;
  trips: Types.ObjectId[];
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    googleId: { type: String },

    trips: [{ type: Schema.Types.ObjectId, ref: "Trip" }],
  },
  { timestamps: true },
);

export const User = model<IUser>("User", UserSchema);
