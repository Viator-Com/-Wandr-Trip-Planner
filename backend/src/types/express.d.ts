import { IUser } from "../models/user.schema";
import { Request } from "express";

export interface AuthRequest extends Request {
  user?: IUser;
}

import { IUser } from "../../models/user.schema.js";

declare global {
  namespace Express {
    interface Request {
      user: IUser;
    }
  }
}

export {};
