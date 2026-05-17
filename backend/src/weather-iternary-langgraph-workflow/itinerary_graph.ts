import { StateGraph, START, END, AnnotationRoot } from "@langchain/langgraph";
import { State } from "./state.js";
import { assistantGraph } from "../langgraph_mcp/index.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";

export async function itinerary_operation(
  state: State,
): Promise<{ messages: BaseMessage[] }> {
  const msg = `
                You are a Trip Management Agent.

                You are operating on a specific trip identified by the following tripId:
                {state.tripId}

                User query:
                {state.query}

                Your responsibilities:
                - Use the tripId as the single source of truth for all trip-related actions.
                - Interpret the user query and determine whether trip context is required.
                - When trip context is required (start date, end date, itinerary), call the
                  fetch-trip-from-database tool using the provided tripId.
                - When updates are finalized and need to be persisted, call the
                  update-trip-in-database tool with the same tripId and the computed updates.

                Rules:
                - Never infer or guess a tripId.
                - Never modify trip data without first fetching the current trip state.
                - Do not call update tools for planning, suggestions, or draft content.
                - Ensure updates are minimal and only affect the fields explicitly requested.
                - If the trip cannot be found, stop and report the error.

                Expected behavior:
                - Read → reason → update → save
                - All tool calls must reference the provided tripId.
                `;

  // const msg = prompt.invoke({
  //   tripId: state.tripId,
  //   messages: state.messages,
  // });
  const res = await assistantGraph.invoke({
    messages: [new HumanMessage(msg)],
  });

  return {
    messages: res.messages,
  };
}

const graph = new StateGraph(State).addNode(
  "itinerary_operation",
  itinerary_operation,
);
