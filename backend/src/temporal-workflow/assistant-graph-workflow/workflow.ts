import {
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  proxyActivities,
} from "@temporalio/workflow";

import type * as activities from "./activities/handleUserQuery.js";

const { runAssistantGraph } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

type UserQuery = {
  query: string;
  userId: string;
};

export const userQuerySignal = defineSignal<[UserQuery]>("userQuery");

export async function AssistantGraphWorkflow(tripId: string) {
  const queue: UserQuery[] = [];

  setHandler(userQuerySignal, (q) => {
    console.error("from set handler -> ", q);
    queue.push(q);
  });

  while (true) {
    await condition(() => queue.length > 0);
    const { query, userId } = queue.shift()!;
    await runAssistantGraph({ query, tripId, userId });
  }
}
