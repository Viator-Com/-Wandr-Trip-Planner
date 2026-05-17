import { assistantGraph, buildRouterGraph } from "./index.js";
import { HumanMessage } from "@langchain/core/messages";
import "dotenv/config";

async function main() {
  // await buildRouterGraph.invoke({});
  const result = await assistantGraph.invoke(
    {
      messages: [
        new HumanMessage(
          `a one-way flight from Udaipur to Jaipur on 20 May 2026,cabin class,one passenger`,
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
