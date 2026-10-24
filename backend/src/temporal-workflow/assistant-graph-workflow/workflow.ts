import {
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  proxyActivities,
  continueAsNew,
} from "@temporalio/workflow";

import type * as activities from "./activities/handleUserQuery.js";

/* Per-activity timeouts and retry policies: each step fails and retries on its own. */

// DB reads: fast, transient failures are safe to retry.
const { loadContextActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumInterval: "15s",
    maximumAttempts: 5,
    nonRetryableErrorTypes: ["InvalidInput"],
  },
});

// LLM graph: slow and expensive, so fewer attempts and a longer timeout.
// Tune startToCloseTimeout from your measured p95/p99 graph latency.
const { runGraphActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "90 seconds",
  retry: {
    initialInterval: "2s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["InvalidInput"],
  },
});

// DB write: retried alone, so a failed insert never re-runs the LLM.
const { saveChatActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumInterval: "15s",
    maximumAttempts: 5,
  },
});

type UserQuery = {
  query: string;
  userId: string;
};

export const userQuerySignal = defineSignal<[UserQuery]>("userQuery");
export const queueLengthQuery = defineQuery<number>("queueLength");

// Start a fresh run (with a clean event history) after this many messages.
const MAX_MESSAGES_PER_RUN = 200;

export async function AssistantGraphWorkflow(
  tripId: string,
  pending: UserQuery[] = [],
) {
  const queue: UserQuery[] = [...pending];

  setHandler(userQuerySignal, (q) => {
    queue.push(q);
  });
  setHandler(queueLengthQuery, () => queue.length);

  let processed = 0;

  while (processed < MAX_MESSAGES_PER_RUN) {
    await condition(() => queue.length > 0);
    const { query, userId } = queue.shift()!;

    try {
      // 1. Load context. Retries only the DB reads.
      const { history, savedTrip } = await loadContextActivity({
        tripId,
        userId,
      });

      // 2. Run the graph. Retries only the LLM call; nothing is written yet.
      const { conversation } = await runGraphActivity({
        query,
        history,
        savedTrip,
      });

      // 3. Save the chat. Retries only the insert; the LLM result is already
      //    in workflow history, so no second generation happens.
      if (conversation) {
        try {
          await saveChatActivity({ tripId, conversation });
        } catch (err) {
          // Saving the chat must never fail the user's request.
          console.error(
            "[workflow] saveChatActivity failed after retries",
            err,
          );
        }
      }
    } catch (err) {
      // One failed message (after retries) must not block the queue.
      console.error("[workflow] message failed after retries, skipping", err);
    }

    processed++;
  }

  // Carry unprocessed signals into the next run so nothing is dropped.
  await continueAsNew<typeof AssistantGraphWorkflow>(tripId, queue);
}
