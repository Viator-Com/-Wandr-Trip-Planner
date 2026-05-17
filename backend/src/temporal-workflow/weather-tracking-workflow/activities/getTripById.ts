import { getTripByIdService } from "../../../services/getTripByIdService.js";

export const getTripById = (tripId: string) => {
  return getTripByIdService(tripId);
};
