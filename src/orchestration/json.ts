/**
 * Balanced-JSON extraction for model output.
 *
 * A model reply is prose with JSON somewhere inside it. The old greedy `/\{[\s\S]*\}/` match
 * swallowed everything between the first brace and the last one, so a stray brace in prose (or a
 * trailing fragment after the JSON) turned a usable reply into a parse error -- and a parse error
 * used to escape as an exception that killed the run.
 *
 * These helpers scan for balanced objects and parse each candidate on its own: a malformed
 * candidate is skipped, a later valid one is still found, and nothing here throws.
 */

/** Every balanced `{...}` object in the text that parses as JSON, in the order they appear. */
export function jsonObjects(text: string): unknown[] {
  const values: unknown[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const end = matchingBrace(text, index);
    if (end < 0) break;
    try {
      values.push(JSON.parse(text.slice(index, end + 1)));
      index = end;
    } catch {
      // Not valid JSON on its own: keep scanning, an inner object may still be one.
    }
  }
  return values;
}

/**
 * The first JSON object in the text that matches, or undefined when there is none.
 * `matches` only ever sees a plain object, never an array or a primitive.
 */
export function firstJsonObject(text: string, matches: (value: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  for (const value of jsonObjects(text)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && matches(value as Record<string, unknown>)) return value as Record<string, unknown>;
  }
  return undefined;
}

/** Index of the `}` that closes the `{` at `start`, or -1 when the object never closes. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
