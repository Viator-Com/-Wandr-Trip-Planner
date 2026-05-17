import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const State = Annotation.Root({
  tripId: Annotation<string>,
  query: Annotation<string>,
});

export type State = typeof State.State;
