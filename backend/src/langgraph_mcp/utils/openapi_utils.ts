/**
 * Utilities for converting an OpenAPI spec into OpenAI-compatible tools
 * and executing API calls.
 */

import { OpenAPISpec } from "./openapi_spec.js";

/* =========================================================
 * Helpers
 * =========================================================
 */

function getDescription(obj: any, preferShort: boolean): string | undefined {
  return preferShort
    ? (obj?.summary ?? obj?.description)
    : (obj?.description ?? obj?.summary);
}

function formatUrl(url: string, pathParams: Record<string, any>): string {
  const matches = url.matchAll(/{(.*?)}/g);
  const replacements: Record<string, string> = {};

  for (const match of matches) {
    const raw = match[1];
    const clean = raw.replace(/^[.;]/, "").replace(/\*$/, "");
    const value = pathParams[clean];

    if (value === undefined) {
      throw new Error(`Missing path param: ${clean}`);
    }

    replacements[raw] = Array.isArray(value)
      ? value.join(",")
      : typeof value === "object"
        ? Object.entries(value)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")
        : String(value);
  }

  return url.replace(/{(.*?)}/g, (_, key) => replacements[key]);
}

/* =========================================================
 * OpenAPI → OpenAI Tools
 * =========================================================
 */

export function openapiSpecToOpenAIFunction(
  spec: OpenAPISpec,
): [
  Array<Record<string, any>>,
  (
    name: string,
    args: Record<string, any>,
    headers?: Record<string, string>,
  ) => Promise<Response>,
] {
  if (!spec.spec.paths) {
    return [[], async () => new Response(null)];
  }

  const functions: any[] = [];
  const nameToCallMap: Record<string, { method: string; url: string }> = {};

  for (const path of Object.keys(spec.spec.paths)) {
    for (const method of spec.getMethodsForPath(path)) {
      const operation = spec.getOperation(path, method);
      const operationId = OpenAPISpec.getCleanedOperationId(
        operation,
        path,
        method,
      );

      functions.push({
        name: operationId,
        description: getDescription(operation, true),
        parameters: { type: "object", properties: {} },
      });

      nameToCallMap[operationId] = {
        method,
        url: spec.baseUrl + path,
      };
    }
  }

  async function defaultCallApi(
    name: string,
    fnArgs: Record<string, any>,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const entry = nameToCallMap[name];
    if (!entry) throw new Error(`Unknown operation: ${name}`);

    const finalUrl = formatUrl(entry.url, fnArgs.path_params ?? {});
    delete fnArgs.path_params;

    return fetch(finalUrl, {
      method: entry.method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
        ...(fnArgs.headers ?? {}),
      },
      body: fnArgs.json ? JSON.stringify(fnArgs.json) : undefined,
    });
  }

  return [functions, defaultCallApi];
}
