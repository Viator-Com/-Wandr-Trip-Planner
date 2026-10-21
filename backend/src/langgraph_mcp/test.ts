import { graph } from "./graph.js";
import { HumanMessage } from "@langchain/core/messages";
import "dotenv/config";

async function main() {
  // await buildRouterGraph.invoke({});
  const result = await graph.invoke(
    {
      messages: [
        new HumanMessage(
          `I'm flying from Jaipur to Mumbai on 10 Oct 2026 for 3 days. Find the cheapest and fastest flights, suggest the top 5 places to visit in Mumbai, and tell me if there are any current travel advisories or weather concerns."`,
        ),
      ],
    },
    {
      recursionLimit: 50,
    },
  );

  console.log(result.messages);
}

main().catch(console.error);
