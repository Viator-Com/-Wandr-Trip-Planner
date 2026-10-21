/**
 * search_flights flow. One tool call from the agent triggers:
 *
 *   validate → connect to Kiwi → run best / cheapest / fastest searches in parallel
 *            → merge + dedupe → one compact result with booking links
 */

import {
  FlightToolError,
  SearchInput,
  SortLabel,
  buildArgs,
  callSearch,
  getConnection,
  supportedSorts,
} from "./kiwiclient.js";
import {
  Batch,
  capSize,
  mergeOptions,
  parseResult,
  truncate,
} from "./format.js";

const MAX_RESULT_CHARS = 14_000;
const MAX_TEXT_FALLBACK_CHARS = 10_000;

/** How many options to keep from each sort. */
const TAKE: Record<SortLabel, number> = { best: 5, cheapest: 3, fastest: 3 };
const SINGLE_SEARCH_TAKE = 8;

function assertDate(label: string, value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new FlightToolError(
      `${label} must be a valid YYYY-MM-DD date (got "${value}").`,
    );
  }
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  if (value < yesterday)
    throw new FlightToolError(`${label} ${value} is in the past.`);
}

function validate(input: SearchInput) {
  assertDate("date", input.date);
  if (input.returnDate) {
    assertDate("return_date", input.returnDate);
    if (input.returnDate < input.date)
      throw new FlightToolError("return_date is before date.");
  }
  if (input.infants > input.adults) {
    throw new FlightToolError(
      "Each infant needs an adult: infants cannot exceed adults.",
    );
  }
  if (input.adults + input.children + input.infants > 9) {
    throw new FlightToolError("At most 9 passengers per search.");
  }
}

export async function searchFlightsFlow(input: SearchInput) {
  validate(input);

  const conn = await getConnection();
  const sorts = supportedSorts(conn);

  // Only run extra sorts when Kiwi's schema actually supports them.
  const plan: Array<{ label: SortLabel; sort?: string; take: number }> =
    sorts.cheapest || sorts.fastest
      ? (["best", "cheapest", "fastest"] as SortLabel[])
          .filter((l) => l === "best" || sorts[l])
          .map((label) => ({ label, sort: sorts[label], take: TAKE[label] }))
      : [{ label: "best", take: SINGLE_SEARCH_TAKE }];

  const settled = await Promise.allSettled(
    plan.map(async (p) => ({
      p,
      parsed: parseResult(
        await callSearch(conn, buildArgs(conn, input, p.sort)),
      ),
    })),
  );

  const ok = settled.flatMap((s) =>
    s.status === "fulfilled" ? [s.value] : [],
  );
  if (!ok.length) {
    const first = settled.find(
      (s) => s.status === "rejected",
    ) as PromiseRejectedResult;
    throw first.reason;
  }

  const notes: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "rejected")
      notes.push(
        `The "${plan[i].label}" search failed; that ranking is missing.`,
      );
  });

  const query = {
    origin: input.origin,
    destination: input.destination,
    date: input.date,
    return_date: input.returnDate,
    flexible_days: input.flexibleDays || undefined,
    cabin_class: input.cabinClass,
    passengers: {
      adults: input.adults,
      children: input.children,
      infants: input.infants,
    },
    currency: input.currency,
  };

  // Non-JSON output (e.g. a markdown table): return it as text, trimmed.
  const listed = ok.filter((r) => r.parsed.items !== null);
  if (!listed.length) {
    const text = ok[0].parsed.text;
    return text
      ? {
          status: "ok",
          format: "text",
          query,
          text: truncate(text, MAX_TEXT_FALLBACK_CHARS),
          notes,
        }
      : {
          status: "no_results",
          query,
          message:
            "No flights were found. Do not repeat this search; suggest flexible dates or a nearby airport.",
        };
  }

  const batches: Batch[] = listed.map((r) => ({
    label: r.p.label,
    items: r.parsed.items!,
    take: r.p.take,
  }));

  const options = capSize(mergeOptions(batches), MAX_RESULT_CHARS);

  if (!options.length) {
    return {
      status: "no_results",
      query,
      message:
        "No flights were found. Do not repeat this search; suggest flexible dates or a nearby airport.",
    };
  }

  return {
    status: "ok",
    query,
    options,
    notes: notes.length ? notes : undefined,
  };
}
