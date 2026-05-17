import { assistantGraph, buildRouterGraph } from "./index.js";
import { HumanMessage } from "@langchain/core/messages";
import "dotenv/config";

async function main() {
  // await buildRouterGraph.invoke({});
  const result = await assistantGraph.invoke(
    {
      messages: [
        new HumanMessage(
          `find flights from jaipur to mumbai for economy class for 20 may 2026`,
        ),
      ],
    },
    {
      recursionLimit: 50,
    },
  );

  console.log(result.messages);
  console.log(result.queries);
}

main().catch(console.error);
