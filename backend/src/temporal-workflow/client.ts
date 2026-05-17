import { Client, Connection } from "@temporalio/client";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const connection = await Connection.connect({
    address: "localhost:7233",
  });

  client = new Client({ connection });
  return client;
}
