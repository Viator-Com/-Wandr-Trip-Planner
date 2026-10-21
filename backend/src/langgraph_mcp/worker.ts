/**
 * Worker: a small, bounded ReAct loop for ONE MCP server.
 *
 *   model sees: system playbook + task + its OWN tool calls/results (scratchpad)
 *   loop ends : model says DONE | step cap | nothing new admitted | repeated errors
 *
 * Why this cannot loop forever:
 *   - hard step cap per server
 *   - identical calls are rejected (normalised signature)
 *   - per-tool call caps (polling tools get an explicit allowance)
 *   - a step where every call is rejected ends the run
 *   - two consecutive all-error steps end the run
 */

import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";

import { Configuration } from "./configruation.js";
import {
  nowContext,
  workerSystemPrompt,
  workerTaskMessage,
} from "./prompts.js";
import type { Finding, ServerName } from "./state.js";
import {
  SERVER_LIMITS,
  ServerLimits,
  callSignature,
  executeTool,
  loadServerTools,
} from "./tools.js";
import { loadChatModel } from "./utils/utils.js";

export interface WorkerInput {
  server: ServerName;
  query: string;
  /** Saved trip + formatted findings from earlier stages (e.g. places -> tavily). */
  prior: string;
  configuration: Configuration;
  config: RunnableConfig;
}

const log = (server: string, msg: string) =>
  console.error(`[worker:${server}] ${msg}`);

const fail = (server: ServerName, error: string): Finding => ({
  server,
  ok: false,
  data: "",
  calls: [],
  error,
});

/** Returns a rejection reason, or null if the call may run. */
function admit(
  name: string,
  signature: string,
  signatures: string[],
  limits: ServerLimits,
): string | null {
  const repeatCap = limits.repeatable[name];

  if (repeatCap === undefined && signatures.includes(signature)) {
    return "an identical call was already made";
  }

  const used = signatures.filter((s) => s.startsWith(`${name}::`)).length;
  const cap = repeatCap ?? limits.perTool;
  if (used >= cap) return `call limit for ${name} reached (${cap})`;

  return null;
}

export async function runWorker(input: WorkerInput): Promise<Finding> {
  const { server, query, prior, configuration, config } = input;

  const serverConfig = configuration.mcpServerConfig?.mcpServers?.[server];
  if (!serverConfig) return fail(server, `no MCP config for "${server}"`);

  const limits = SERVER_LIMITS[server];

  let tools;
  try {
    tools = await loadServerTools(server, serverConfig);
  } catch (e: any) {
    return fail(server, `could not load tools: ${e?.message ?? e}`);
  }
  if (!tools.length) return fail(server, "server exposes no usable tools");

  const model = loadChatModel(configuration.workerModel);
  const firstTurn = model.bindTools(tools, { tool_choice: "required" });
  const laterTurns = model.bindTools(tools);

  const system = new SystemMessage(
    workerSystemPrompt(server, { now: nowContext() }),
  );

  // Private scratchpad: never leaks into global state.
  const scratch: BaseMessage[] = [
    new HumanMessage(workerTaskMessage({ query, prior })),
  ];

  const signatures: string[] = [];
  const outputs: string[] = [];
  let successes = 0;
  let errorSteps = 0;
  let lastError: string | undefined;

  for (let step = 1; step <= limits.maxSteps; step++) {
    const ai = (await (step === 1 ? firstTurn : laterTurns).invoke(
      [system, ...scratch],
      config,
    )) as AIMessage;

    scratch.push(ai);

    const calls = ai.tool_calls ?? [];
    if (!calls.length) {
      log(server, `step ${step}: model finished`);
      break;
    }

    // 1) Decide admission synchronously so duplicates inside one step are caught too.
    const decisions = calls.map((call, i) => {
      const id = call.id ?? `${call.name}-${step}-${i}`;
      const sig = callSignature(call.name, call.args);
      const reason = admit(call.name, sig, signatures, limits);
      if (!reason) signatures.push(sig);
      return { call, id, reason };
    });

    // 2) Execute admitted calls in parallel.
    const results = await Promise.all(
      decisions.map((d) =>
        d.reason
          ? Promise.resolve(null)
          : executeTool(
              server,
              serverConfig,
              d.call.name,
              d.call.args ?? {},
              limits.maxOutputChars,
            ),
      ),
    );

    // 3) Record results.
    let admitted = 0;
    let errors = 0;

    decisions.forEach((d, i) => {
      const res = results[i];

      if (!res) {
        log(server, `step ${step}: rejected ${d.call.name} (${d.reason})`);
        scratch.push(
          new ToolMessage({
            content: `Rejected: ${d.reason}. Use the results you already have, or reply DONE.`,
            tool_call_id: d.id,
            name: d.call.name,
          }),
        );
        return;
      }

      admitted++;
      if (res.ok) successes++;
      else {
        errors++;
        lastError = res.text;
      }

      outputs.push(
        `### ${d.call.name} ${JSON.stringify(d.call.args ?? {})}\n${res.text}`,
      );
      scratch.push(
        new ToolMessage({
          content: res.text,
          tool_call_id: d.id,
          name: d.call.name,
        }),
      );
    });

    log(
      server,
      `step ${step}: ${admitted} run, ${decisions.length - admitted} rejected, ${errors} failed`,
    );

    if (admitted === 0) break; // model is stuck repeating itself
    errorSteps = errors === admitted ? errorSteps + 1 : 0;
    if (errorSteps >= 2) break; // server is failing, stop burning calls
  }

  return {
    server,
    ok: successes > 0,
    data: outputs.join("\n\n"),
    calls: signatures,
    error: successes > 0 ? undefined : (lastError ?? "no data retrieved"),
  };
}
