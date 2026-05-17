import express from "express";
import {
  appendConversation,
  getChatByTripId,
} from "../controllers/ChatController.js";
import { protect } from "../controllers/auth.controller.js";

const router = express.Router();
router.use(protect);
router.get("/:tripId", getChatByTripId);
router.post("/:tripId", appendConversation);

export default router;
