import { getTemporalClient } from "../client.js";

const client = await getTemporalClient();
const handle = client.workflow.getHandle("weather-6a083f5d6730e0d1262e6726");
const res = await handle.query("getStatus");
console.log(res);
