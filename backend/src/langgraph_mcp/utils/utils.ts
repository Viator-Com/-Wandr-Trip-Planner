/**
 * Utility functions for the retrieval graph.
 *
 * This module contains utility functions for handling messages,
 * documents, and OpenAPI-related helpers.
 */

import { Document } from "@langchain/core/documents";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

/* =========================================================
 * Message Utilities
 * =========================================================
 */

// export function getMessageText(msg: BaseMessage): string {
//   const content: any = (msg as any).content;

//   if (typeof content === "string") {
//     return content;
//   }

//   if (typeof content === "object" && !Array.isArray(content)) {
//     return content.text ?? "";
//   }

//   if (Array.isArray(content)) {
//     const parts = content.map((c) =>
//       typeof c === "string" ? c : c?.text ?? ""
//     );
//     return parts.join("").trim();
//   }

//   return "";
// }

export function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content.map((c) => ("text" in c ? c.text : "")).join("");
  }

  return "";
}

/* =========================================================
 * Document Formatting
 * =========================================================
 */

function formatDoc(doc: Document): string {
  const metadata = doc.metadata ?? {};
  const metaStr = Object.entries(metadata)
    .map(([k, v]) => ` ${k}=${JSON.stringify(v)}`)
    .join("");

  return `<document${metaStr}>
${doc.pageContent}
</document>`;
}

export function formatDocs(docs?: Document[] | null): string {
  if (!docs || docs.length === 0) {
    return "<documents></documents>";
  }

  const formatted = docs.map(formatDoc).join("\n");

  return `<documents>
${formatted}
</documents>`;
}

/* =========================================================
 * Chat Model Loader
 * =========================================================
 */
export function loadChatModel(model: string) {
  return new ChatOpenAI({
    model,
    openAIApiKey: process.env.OPENAI_API_KEY!,
  });
}

/* =========================================================
 * OpenAPI Ref Inlining Utilities
 * =========================================================
 */

function inlineRefs(
  node: any,
  root: any,
  visited: Set<string> = new Set(),
): any {
  if (Array.isArray(node)) {
    return node.map((item) => inlineRefs(item, root, visited));
  }

  if (node === null || typeof node !== "object") {
    return node;
  }

  if (node.$ref) {
    const ref: string = node.$ref;

    if (visited.has(ref)) {
      return {};
    }

    visited.add(ref);

    if (ref.startsWith("#/")) {
      const parts = ref.replace(/^#\//, "").split("/");
      let target = root;
      for (const p of parts) {
        if (!(p in target)) {
          throw new Error(`Could not find reference: ${ref}`);
        }
        target = target[p];
      }
      return inlineRefs(target, root, visited);
    }

    throw new Error(`External ref not supported: ${ref}`);
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    result[k] = inlineRefs(v, root, visited);
  }

  return result;
}

export function inlineOperation(
  openapiSpec: any,
  path: string,
  method: string,
): any {
  const specCopy = structuredClone(openapiSpec);
  const methodLower = method.toLowerCase();

  const operation = specCopy?.paths?.[path]?.[methodLower];

  if (!operation) {
    throw new Error(`No such operation: ${method.toUpperCase()} ${path}`);
  }

  const requestBody = operation.requestBody?.content ?? {};
  for (const media of Object.values<any>(requestBody)) {
    if (media.schema) {
      media.schema = inlineRefs(media.schema, specCopy);
    }
  }

  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.schema) {
        param.schema = inlineRefs(param.schema, specCopy);
      }
    }
  }

  for (const response of Object.values<any>(operation.responses ?? {})) {
    for (const media of Object.values<any>(response.content ?? {})) {
      if (media.schema) {
        media.schema = inlineRefs(media.schema, specCopy);
      }
    }
  }

  return specCopy;
}

/* =========================================================
 * OpenAPI Operation Lookup
 * =========================================================
 */

export function findPathFromOperationId(
  openapiSpec: any,
  operationId: string,
): [string | null, string | null] {
  for (const [path, pathItem] of Object.entries<any>(
    openapiSpec?.paths ?? {},
  )) {
    for (const [method, operation] of Object.entries<any>(pathItem ?? {})) {
      if (operation?.operationId === operationId) {
        return [path, method];
      }
    }
  }
  return [null, null];
}

export function extractInlinedOperationData(
  openapiSpec: any,
  operationId: string,
): any {
  const specCopy = structuredClone(openapiSpec);

  let foundOperation: any = null;

  for (const pathItem of Object.values<any>(specCopy.paths ?? {})) {
    for (const operation of Object.values<any>(pathItem ?? {})) {
      if (operation?.operationId === operationId) {
        foundOperation = operation;
        break;
      }
    }
    if (foundOperation) break;
  }

  if (!foundOperation) {
    throw new Error(`No operation found with operationId: ${operationId}`);
  }

  const result: any = {};

  if (foundOperation.parameters) {
    result.parameters = inlineRefs(foundOperation.parameters, specCopy);
  }

  if (foundOperation.requestBody) {
    result.requestBody = inlineRefs(foundOperation.requestBody, specCopy);
  }

  return result;
}

/* =========================================================
 * JSON Schema Merge Utility
 * =========================================================
 */

export function mergeJsonStructure(data: any): Record<string, any> {
  const paramsProps = data?.params?.properties ?? {};
  const jsonProps = data?.json?.properties ?? {};

  return {
    ...paramsProps,
    ...jsonProps,
  };
}
