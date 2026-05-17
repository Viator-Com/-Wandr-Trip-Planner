import express from "express";
import {
  createTrip,
  deleteTripById,
  getAllTripsOfUser,
  getTripById,
  updateTripById,
  updateTripItinerary,
} from "../controllers/Trip.controller.js";
import { protect } from "../controllers/auth.controller.js";

const router = express.Router();

router.use(protect);

router.post("/", createTrip);
router.patch("/:tripId/itinerary", updateTripItinerary);
router.patch("/:tripId", updateTripById);
router.get("/usertrips", getAllTripsOfUser);
router.get("/:tripId", getTripById);
router.delete("/:tripId", deleteTripById);
export default router;
