import axios from "axios";

const BASE_URL = "http://localhost:3000";

export async function sendQuery(
  query: string,
  tripId: string,
): Promise<boolean> {
  if (!query.trim() || !tripId) {
    throw new Error("Invalid query or tripId");
  }

  try {
    await axios.post(
      `${BASE_URL}/api/temporal/sendQuery`,
      { query, tripId },
      { withCredentials: true },
    );

    return true;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("SendQuery Error:", err.response?.data || err.message);
    } else {
      console.error("Unexpected Error:", err);
    }

    return false;
  }
}
