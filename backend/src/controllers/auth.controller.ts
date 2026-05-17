import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send a consistently-shaped error response. */
const sendError = (res: Response, status: number, message: string) =>
  res.status(status).json({ message });

// ─────────────────────────────────────────────────────────────────────────────

export const signup = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!username || !email || !password) {
      return sendError(res, 400, "Username, email, and password are required");
    }

    if (!EMAIL_REGEX.test(email)) {
      return sendError(res, 400, "Invalid email format");
    }

    if (password.length < 8) {
      return sendError(res, 400, "Password must be at least 8 characters");
    }

    // ── Business logic ────────────────────────────────────────────────────────
    const existing = await User.findOne({ email });
    if (existing) {
      return sendError(res, 409, "An account with this email already exists");
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hashed });

    res.status(201).json({ message: "Account created successfully" });
  } catch (err) {
    console.error("[signup]", err);
    sendError(res, 500, "Something went wrong while creating your account");
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, "Email and password are required");
    }

    if (!EMAIL_REGEX.test(email)) {
      return sendError(res, 400, "Invalid email format");
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      // Use a generic message to avoid leaking whether the email exists
      return sendError(res, 401, "Invalid email or password");
    }

    if (!user.password) {
      return sendError(
        res,
        401,
        "This account uses a different sign-in method. Please log in accordingly.",
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 401, "Invalid email or password");
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Logged in successfully",
      token,
      id: user._id,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    console.error("[login]", err);
    sendError(res, 500, "Something went wrong while logging in");
  }
};

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return sendError(
        res,
        401,
        "You are not logged in. Please log in to continue.",
      );
    }

    let decoded: { id: string };
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };
    } catch (jwtErr: any) {
      const message =
        jwtErr.name === "TokenExpiredError"
          ? "Your session has expired. Please log in again."
          : "Invalid authentication token. Please log in again.";
      return sendError(res, 401, message);
    }

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return sendError(
        res,
        401,
        "The account associated with this session no longer exists.",
      );
    }

    req.user = currentUser;
    next();
  } catch (err) {
    console.error("[protect]", err);
    next(err);
  }
};

export const updateEmail = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 401, "Not authenticated");
    }

    const { currentEmail, newEmail } = req.body;

    if (!currentEmail || !newEmail) {
      return sendError(res, 400, "Both current and new email are required");
    }

    if (currentEmail === newEmail) {
      return sendError(
        res,
        400,
        "New email must be different from your current email",
      );
    }

    if (!EMAIL_REGEX.test(newEmail)) {
      return sendError(res, 400, "New email address has an invalid format");
    }

    const existing = await User.findOne({ email: newEmail });
    if (existing) {
      return sendError(
        res,
        409,
        "This email address is already in use by another account",
      );
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendError(res, 404, "User account not found");
    }

    if (user.email !== currentEmail) {
      return sendError(
        res,
        400,
        "The current email you entered does not match our records",
      );
    }

    user.email = newEmail;
    await user.save();

    res.json({ message: "Email updated successfully" });
  } catch (err) {
    console.error("[updateEmail]", err);
    sendError(res, 500, "Something went wrong while updating your email");
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 401, "Not authenticated");
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, "Both current and new password are required");
    }

    if (newPassword.length < 8) {
      return sendError(
        res,
        400,
        "New password must be at least 8 characters long",
      );
    }

    if (currentPassword === newPassword) {
      return sendError(
        res,
        400,
        "New password must be different from your current password",
      );
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !user.password) {
      return sendError(res, 404, "User account not found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendError(res, 401, "Your current password is incorrect");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("[updatePassword]", err);
    sendError(res, 500, "Something went wrong while updating your password");
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 401, "Not authenticated");
    }

    const { password } = req.body;

    if (!password) {
      return sendError(
        res,
        400,
        "Your password is required to delete your account",
      );
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !user.password) {
      return sendError(res, 404, "User account not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(
        res,
        401,
        "Incorrect password. Account was not deleted.",
      );
    }

    await User.findByIdAndDelete(req.user._id);
    res.clearCookie("token");

    res.json({ message: "Your account has been deleted successfully" });
  } catch (err) {
    console.error("[deleteUser]", err);
    sendError(res, 500, "Something went wrong while deleting your account");
  }
};

export const logout = (req: Request, res: Response) => {
  try {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("[logout]", err);
    sendError(res, 500, "Something went wrong while logging out");
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return sendError(res, 401, "Not authenticated");
    }

    const user = await User.findById(req.user._id).populate("trips");
    if (!user) {
      return sendError(res, 404, "User account not found");
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("[getMe]", err);
    next(err);
  }
};
