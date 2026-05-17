import { Connection, Client } from "@temporalio/client";

import { AssistantGraphWorkflow } from "./workflow.js";

async function main() {
  const tripId = "6974a2d1800dce0d4c547cb1";
  const queryText = "what is best place in india to visit this time ?";

  const connection = await Connection.connect({
    address: "localhost:7233",
  });

  const client = new Client({ connection });

  const workflowId = tripId;

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
    query: queryText,
  });
}

main().catch((err) => {
  console.error("error from client", err.message);
  process.exit(1);
});
