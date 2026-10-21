import { Connection, Client } from "@temporalio/client";

import { AssistantGraphWorkflow } from "./workflow.js";

async function main() {
  const tripId = "6ac34c38e3a8411ad3f7de2b";
  const queryText = "can you suggest some attraction place in jaipur";

  const connection = await Connection.connect({
    address: "localhost:7233",
  });

  const client = new Client({ connection });

  const workflowId = "assistant-" + tripId;

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
