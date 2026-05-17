import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/handleUserQuery.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

async function run() {
  const connection = await NativeConnection.connect({
    address: "localhost:7233",
  });

  await mongoose.connect(process.env.MONGO_URI!);
  console.log("MongoDB connected in worker");

  try {
    const worker = await Worker.create({
      connection,
      namespace: "default",
      taskQueue: "assistant-queue",
      workflowsPath: path.join(__dirname, "workflow.ts"),
      activities,
    });

    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
