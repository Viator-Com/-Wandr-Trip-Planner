/**
 * Utility functions for parsing an OpenAPI spec.
 */

import fs from "fs";
import path from "path";
import yaml from "yaml";

/* =========================================================
 * HTTP Verb Enum
 * =========================================================
 */

export enum HTTPVerb {
  GET = "get",
  PUT = "put",
  POST = "post",
  DELETE = "delete",
  OPTIONS = "options",
  HEAD = "head",
  PATCH = "patch",
  TRACE = "trace",
}

export function httpVerbFromString(verb: string): HTTPVerb {
  if (!Object.values(HTTPVerb).includes(verb as HTTPVerb)) {
    throw new Error(
      `Invalid HTTP verb. Valid values are ${Object.values(HTTPVerb).join(", ")}`,
    );
  }
  return verb as HTTPVerb;
}

/* =========================================================
 * OpenAPI Spec Helper
 * =========================================================
 */

export class OpenAPISpec {
  openapi: string = "3.1.0";
  spec: any;

  constructor(spec: any) {
    this.alertUnsupportedSpec(spec);
    this.spec = spec;
  }

  /* ---------------- Strict Accessors ---------------- */

  private get pathsStrict(): any {
    if (!this.spec.paths) {
      throw new Error("No paths found in spec");
    }
    return this.spec.paths;
  }

  private getPathStrict(pathKey: string): any {
    const item = this.pathsStrict[pathKey];
    if (!item) {
      throw new Error(`No path found for ${pathKey}`);
    }
    return item;
  }

  private get componentsStrict(): any {
    if (!this.spec.components) {
      throw new Error("No components found in spec.");
    }
    return this.spec.components;
  }

  private get parametersStrict(): Record<string, any> {
    const params = this.componentsStrict.parameters;
    if (!params) {
      throw new Error("No parameters found in spec.");
    }
    return params;
  }

  private get schemasStrict(): Record<string, any> {
    const schemas = this.componentsStrict.schemas;
    if (!schemas) {
      throw new Error("No schemas found in spec.");
    }
    return schemas;
  }

  private get requestBodiesStrict(): Record<string, any> {
    const bodies = this.componentsStrict.requestBodies;
    if (!bodies) {
      throw new Error("No request bodies found in spec.");
    }
    return bodies;
  }

  /* ---------------- Reference Resolution ---------------- */

  private getRefName(ref: string): string {
    return ref.split("/").at(-1)!;
  }

  getReferencedSchema(ref: any): any {
    const name = this.getRefName(ref.$ref);
    const schemas = this.schemasStrict;
    if (!schemas[name]) {
      throw new Error(`No schema found for ${name}`);
    }
    return schemas[name];
  }

  getSchema(schema: any, depth = 0, maxDepth?: number): any {
    if (maxDepth !== undefined && depth >= maxDepth) {
      throw new Error("Max depth exceeded when resolving schema references");
    }

    if (schema?.$ref) {
      schema = this.getReferencedSchema(schema);
    }

    if (schema?.properties) {
      for (const key of Object.keys(schema.properties)) {
        schema.properties[key] = this.getSchema(
          schema.properties[key],
          depth + 1,
          maxDepth,
        );
      }
    }

    if (schema?.items) {
      schema.items = this.getSchema(schema.items, depth + 1, maxDepth);
    }

    return schema;
  }

  private getReferencedRequestBody(ref: any): any {
    const name = this.getRefName(ref.$ref);
    const bodies = this.requestBodiesStrict;
    if (!bodies[name]) {
      throw new Error(`No request body found for ${name}`);
    }
    return bodies[name];
  }

  getRequestBodyForOperation(operation: any): any | null {
    let body = operation.requestBody;
    while (body?.$ref) {
      body = this.getReferencedRequestBody(body);
    }
    return body ?? null;
  }

  /* ---------------- Spec Validation ---------------- */

  private alertUnsupportedSpec(obj: any) {
    const warning =
      "This may result in degraded performance. Convert your OpenAPI spec to 3.1.* for better support.";

    if (typeof obj.openapi === "string") {
      if (obj.openapi !== "3.1.0") {
        console.warn(`Attempting to load OpenAPI ${obj.openapi}. ${warning}`);
      }
      return;
    }

    if (typeof obj.swagger === "string") {
      console.warn(`Attempting to load Swagger ${obj.swagger}. ${warning}`);
      return;
    }

    throw new Error(
      `Unsupported OpenAPI spec:\n${JSON.stringify(obj, null, 2)}`,
    );
  }

  /* ---------------- Constructors ---------------- */

  static fromSpecDict(obj: any): OpenAPISpec {
    try {
      return new OpenAPISpec(obj);
    } catch {
      // Best-effort cleanup: drop invalid keys
      const cleaned = structuredClone(obj);
      delete cleaned["$schema"];
      return new OpenAPISpec(cleaned);
    }
  }

  static fromText(text: string): OpenAPISpec {
    let spec: any;
    try {
      spec = JSON.parse(text);
    } catch {
      spec = yaml.parse(text);
    }
    return OpenAPISpec.fromSpecDict(spec);
  }

  static fromFile(filePath: string): OpenAPISpec {
    if (!fs.existsSync(filePath)) {
      throw new Error(`${filePath} does not exist`);
    }
    return OpenAPISpec.fromText(fs.readFileSync(filePath, "utf8"));
  }

  static async fromUrl(url: string): Promise<OpenAPISpec> {
    const res = await fetch(url);
    const text = await res.text();
    return OpenAPISpec.fromText(text);
  }

  /* ---------------- Helpers ---------------- */

  get baseUrl(): string {
    return this.spec.servers?.[0]?.url;
  }

  getMethodsForPath(pathKey: string): string[] {
    const item = this.getPathStrict(pathKey);
    const result: string[] = [];
    for (const verb of Object.values(HTTPVerb)) {
      if (item[verb]) result.push(verb);
    }
    return result;
  }

  getOperation(pathKey: string, method: string): any {
    const item = this.getPathStrict(pathKey);
    const op = item[method];
    if (!op) {
      throw new Error(`No ${method} operation found for ${pathKey}`);
    }
    return op;
  }

  getParametersForOperation(operation: any): any[] {
    const params: any[] = [];
    for (const p of operation.parameters ?? []) {
      if (p?.$ref) {
        const name = this.getRefName(p.$ref);
        params.push(this.parametersStrict[name]);
      } else {
        params.push(p);
      }
    }
    return params;
  }

  static getCleanedOperationId(
    operation: any,
    pathKey: string,
    method: string,
  ): string {
    let id = operation.operationId;
    if (!id) {
      const cleanPath = pathKey
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/^_+/, "");
      id = `${cleanPath}_${method}`;
    }
    return id.replace(/[-./]/g, "_");
  }
}
