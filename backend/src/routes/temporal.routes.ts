import { Router } from "express";
import { sendQuery } from "../controllers/temporalController.js";
import { protect } from "../controllers/auth.controller.js";

const router = Router();
router.use(protect);
router.post("/sendquery", sendQuery);

export default router;
