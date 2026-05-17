import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import tripRoutes from "./routes/trip.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import temporalRoutes from "./routes/temporal.routes.js";
// import "./config/passport.ts";

dotenv.config();
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(morgan("dev"));
// app.use(passport.initialize());

app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/temporal", temporalRoutes);

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("MongoDB connected");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  } catch (error) {
    console.error("Error:", error);
  }
};

startServer();
