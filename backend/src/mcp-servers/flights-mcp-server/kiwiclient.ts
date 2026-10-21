/**
 * Thin adapter around Kiwi.com's official remote MCP server (https://mcp.kiwi.com).
 *
 * Kiwi's `search-flight` tool already accepts city names or airport codes and returns
 * curated results with booking links, so no airport lookup or pagination is needed.
 *
 * Kiwi's exact input schema is not documented in one stable place, so instead of
 * hard-coding argument names this adapter reads the live tools/list schema once,
 * maps our logical fields onto whatever names Kiwi uses, and FAILS LOUDLY on startup
 * if a required field cannot be found. Set KIWI_DEBUG=1 to log schema + raw output.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class FlightToolError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "FlightToolError";
  }
}

const KIWI_URL = process.env.KIWI_MCP_URL ?? "https://mcp.kiwi.com";
const TOOL_NAME = "search-flight";
const CALL_TIMEOUT_MS = 90_000;
const DEBUG = process.env.KIWI_DEBUG === "1";
const log = (...a: unknown[]) => console.error("[kiwi]", ...a);

/* ─────────────── schema → field mapping ─────────────── */

type Props = Record<string, any>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Exact match first, then match ignoring case/underscores/dashes (flyFrom ≙ fly_from). */
function pick(props: Props, candidates: string[]): string | undefined {
  const keys = Object.keys(props);
  for (const c of candidates) if (keys.includes(c)) return c;
  for (const c of candidates) {
    const k = keys.find((k) => norm(k) === norm(c));
    if (k) return k;
  }
  return undefined;
}

interface Fields {
  origin: string;
  destination: string;
  departureDate: string;
  departureFlex?: string;
  returnDate?: string;
  returnFlex?: string;
  passengers?: string;
  adults?: string;
  children?: string;
  infants?: string;
  cabin?: string;
  sort?: string;
  currency?: string;
}

type DateFormat = "DMY" | "MDY" | "ISO";

export interface KiwiConnection {
  client: Client;
  toolName: string;
  props: Props;
  fields: Fields;
  dateFormat: DateFormat;
}

function resolveFields(props: Props): Fields {
  const origin = pick(props, ["flyFrom", "fly_from", "origin", "from"]);
  const destination = pick(props, ["flyTo", "fly_to", "destination", "to"]);
  const departureDate = pick(props, [
    "departureDate",
    "departure_date",
    "dateFrom",
    "date_from",
    "date",
  ]);

  const missing = [
    !origin && "origin",
    !destination && "destination",
    !departureDate && "departure date",
  ].filter(Boolean);

  if (missing.length) {
    throw new FlightToolError(
      `Kiwi's search-flight schema changed: cannot find ${missing.join(", ")} field.`,
      `Schema properties are: ${Object.keys(props).join(", ")}. Update FIELD candidates in kiwiClient.ts.`,
    );
  }

  return {
    origin: origin!,
    destination: destination!,
    departureDate: departureDate!,
    departureFlex: pick(props, [
      "departureDateFlexRange",
      "departure_date_flex_range",
      "dateFlexRange",
      "flexibility",
    ]),
    returnDate: pick(props, ["returnDate", "return_date", "dateTo", "date_to"]),
    returnFlex: pick(props, ["returnDateFlexRange", "return_date_flex_range"]),
    passengers: pick(props, ["passengers"]),
    adults: pick(props, ["adults"]),
    children: pick(props, ["children"]),
    infants: pick(props, ["infants"]),
    cabin: pick(props, ["cabinClass", "cabin_class", "cabin"]),
    sort: pick(props, ["sort", "sortBy", "sort_by"]),
    currency: pick(props, ["curr", "currency"]),
  };
}

function detectDateFormat(prop: any): DateFormat {
  const d = String(prop?.description ?? "");
  if (/yyyy-mm-dd/i.test(d)) return "ISO";
  if (/mm\/dd\/yyyy/i.test(d) && !/dd\/mm\/yyyy/i.test(d)) return "MDY";
  return "DMY"; // Kiwi's documented default
}

function formatDate(iso: string, fmt: DateFormat): string {
  const [y, m, d] = iso.split("-");
  if (fmt === "ISO") return iso;
  return fmt === "MDY" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

/* ─────────────── connection management ─────────────── */

let current: KiwiConnection | null = null;
let connecting: Promise<KiwiConnection> | null = null;

async function connect(): Promise<KiwiConnection> {
  const client = new Client({ name: "wandr-flights", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(KIWI_URL)));

  const { tools } = await client.listTools();
  const tool =
    tools.find((t) => t.name === TOOL_NAME) ??
    tools.find((t) => /search.?flight/i.test(t.name));

  if (!tool) {
    await client.close().catch(() => {});
    throw new FlightToolError(
      `Kiwi MCP does not expose a flight search tool (found: ${tools.map((t) => t.name).join(", ") || "none"}).`,
    );
  }

  const props: Props = (tool.inputSchema as any)?.properties ?? {};
  const fields = resolveFields(props);
  const dateFormat = detectDateFormat(props[fields.departureDate]);

  log(`connected; tool=${tool.name} dateFormat=${dateFormat}`);
  if (DEBUG) log("schema", JSON.stringify(tool.inputSchema).slice(0, 4000));

  return { client, toolName: tool.name, props, fields, dateFormat };
}

export function getConnection(): Promise<KiwiConnection> {
  if (current) return Promise.resolve(current);
  connecting ??= connect()
    .then((c) => (current = c))
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

/** Drop a broken connection. Only clears `current` if it is still that connection. */
async function discard(conn: KiwiConnection) {
  if (current === conn) current = null;
  await conn.client.close().catch(() => {});
}

/* ─────────────── argument builder ─────────────── */

export interface SearchInput {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD
  flexibleDays: number;
  adults: number;
  children: number;
  infants: number;
  cabinClass: "economy" | "premium_economy" | "business" | "first";
  currency: string;
}

function mapCabin(
  prop: any,
  cabin: SearchInput["cabinClass"],
): string | undefined {
  const letter = {
    economy: "M",
    premium_economy: "W",
    business: "C",
    first: "F",
  }[cabin];
  const values: string[] = Array.isArray(prop?.enum) ? prop.enum : [];
  if (!values.length) return letter; // Kiwi's documented codes
  if (values.includes(letter)) return letter;

  const kw = {
    economy: "economy",
    premium_economy: "premium",
    business: "business",
    first: "first",
  }[cabin];
  return values.find(
    (v) =>
      norm(v).includes(kw) &&
      (cabin === "premium_economy" || !norm(v).includes("premium")),
  );
}

export type SortLabel = "best" | "cheapest" | "fastest";

/** Which of our three sort modes this Kiwi schema supports, as the enum values to send. */
export function supportedSorts(
  conn: KiwiConnection,
): Partial<Record<SortLabel, string>> {
  const values: string[] = conn.fields.sort
    ? (conn.props[conn.fields.sort]?.enum ?? [])
    : [];
  const find = (re: RegExp) => values.find((v) => re.test(v));
  return {
    best: find(/quality|best/i),
    cheapest: find(/price|cheap/i),
    fastest: find(/duration|fast/i),
  };
}

export function buildArgs(
  conn: KiwiConnection,
  input: SearchInput,
  sortValue?: string,
): Record<string, any> {
  const f = conn.fields;
  const args: Record<string, any> = {
    [f.origin]: input.origin,
    [f.destination]: input.destination,
    [f.departureDate]: formatDate(input.date, conn.dateFormat),
  };

  if (f.departureFlex) args[f.departureFlex] = input.flexibleDays;

  if (input.returnDate) {
    if (!f.returnDate) {
      throw new FlightToolError(
        "Kiwi's search tool does not support round trips right now.",
      );
    }
    args[f.returnDate] = formatDate(input.returnDate, conn.dateFormat);
    if (f.returnFlex) args[f.returnFlex] = input.flexibleDays;
  }

  if (f.passengers) {
    const inner: Props = conn.props[f.passengers]?.properties ?? {};
    args[f.passengers] = {
      [pick(inner, ["adults"]) ?? "adults"]: input.adults,
      [pick(inner, ["children"]) ?? "children"]: input.children,
      [pick(inner, ["infants"]) ?? "infants"]: input.infants,
    };
  } else {
    if (f.adults) args[f.adults] = input.adults;
    if (f.children) args[f.children] = input.children;
    if (f.infants) args[f.infants] = input.infants;
  }

  if (f.cabin) {
    const cabin = mapCabin(conn.props[f.cabin], input.cabinClass);
    if (cabin) args[f.cabin] = cabin;
  }

  if (f.sort && sortValue) args[f.sort] = sortValue;
  if (f.currency) args[f.currency] = input.currency;

  return args;
}

/* ─────────────── call with one reconnect ─────────────── */

export async function callSearch(
  conn: KiwiConnection,
  args: Record<string, any>,
  attempt = 0,
): Promise<string> {
  try {
    const res: any = await conn.client.callTool(
      { name: conn.toolName, arguments: args },
      undefined,
      { timeout: CALL_TIMEOUT_MS },
    );

    const text = ((res.content ?? []) as any[])
      .filter((c) => c?.type === "text")
      .map((c) => c.text)
      .join("\n");

    if (DEBUG) log("raw", text.slice(0, 4000));

    if (res.isError) {
      throw new FlightToolError(
        `Kiwi rejected the search: ${text.slice(0, 500)}`,
        "Check city names and dates; try an IATA code (e.g. JAI, BOM).",
      );
    }
    return text;
  } catch (e) {
    if (e instanceof FlightToolError) throw e;

    if (attempt === 0) {
      await discard(conn);
      return callSearch(await getConnection(), args, 1);
    }
    throw e;
  }
}
