import type { Request, Response } from "express";
import { getTemporalClient } from "../temporal-workflow/client.js";
import { AssistantGraphWorkflow } from "../temporal-workflow/assistant-graph-workflow/workflow.js";
import type { AuthRequest } from "../types/express.js";

export const sendQuery = async (req: AuthRequest, res: Response) => {
  try {
    console.error("dddd->", req.body);
    if (!req.body || !req.body.tripId || !req.body.query) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { tripId, query } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(400).json({
        error: "userId must be a non-empty string",
      });
    }
    const userId = req.user._id;

    if (typeof tripId !== "string" || tripId.trim().length === 0) {
      return res.status(400).json({
        error: "tripId must be a non-empty string",
      });
    }

    if (typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({
        error: "query must be a non-empty string",
      });
    }

    const client = await getTemporalClient();
    const workflowId = "assistant-" + tripId.trim();

    let handle;

    try {
      handle = client.workflow.getHandle(workflowId);
      await handle.describe();
    } catch {
      handle = await client.workflow.start(AssistantGraphWorkflow, {
        taskQueue: "assistant-queue",
        workflowId,
        args: [tripId],
      });
    }

    await handle.signal("userQuery", {
      query: query.trim(),
      userId: userId,
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("sendQuery error:", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};
