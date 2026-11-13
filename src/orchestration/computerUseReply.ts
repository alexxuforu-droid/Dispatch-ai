export type ComputerUseAction =
  | { type: 'click'; x: number; y: number }
  | { type: 'type'; text: string }
  | { type: 'press'; key: 'Enter' | 'Escape' | 'Tab' | 'Space' | 'Backspace' | 'Delete' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' }
  | { type: 'scroll'; x: number; y: number; delta: number };

type ComputerUseReply =
  | { kind: 'done'; summary: string }
  | { kind: 'action'; summary: string; action: ComputerUseAction }
  | { kind: 'invalid'; reason: string };

const MAX_REPLY_CHARS = 16_384;
const MAX_SUMMARY_CHARS = 2_000;
const KEYS = [
  'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function invalid(reason: string): ComputerUseReply {
  return { kind: 'invalid', reason };
}

function parseAction(value: unknown, width: number, height: number): ComputerUseAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (value.type === 'click' && hasExactKeys(value, ['type', 'x', 'y']) && validPoint(value.x, value.y, width, height)) {
    return { type: 'click', x: value.x as number, y: value.y as number };
  }
  if (value.type === 'type' && hasExactKeys(value, ['type', 'text']) && typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 500) {
    return { type: 'type', text: value.text };
  }
  if (value.type === 'press' && hasExactKeys(value, ['type', 'key']) && typeof value.key === 'string' && KEYS.some(key => key === value.key)) {
    return { type: 'press', key: value.key as Extract<ComputerUseAction, { type: 'press' }>['key'] };
  }
  if (
    value.type === 'scroll'
    && hasExactKeys(value, ['type', 'x', 'y', 'delta'])
    && validPoint(value.x, value.y, width, height)
    && typeof value.delta === 'number'
    && Number.isInteger(value.delta)
    && value.delta >= -2000
    && value.delta <= 2000
  ) {
    return { type: 'scroll', x: value.x as number, y: value.y as number, delta: value.delta };
  }
  return null;
}

function validPoint(x: unknown, y: unknown, width: number, height: number): x is number {
  return Number.isInteger(width) && width > 0
    && Number.isInteger(height) && height > 0
    && typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < width
    && typeof y === 'number' && Number.isInteger(y) && y >= 0 && y < height;
}

export function parseComputerUseReply(raw: string, frame: { width: number; height: number }): ComputerUseReply {
  if (typeof raw !== 'string' || raw.length > MAX_REPLY_CHARS) return invalid('The vision reply is missing or too large.');
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return invalid('The vision reply was not valid JSON.');
  }
  if (!isRecord(value)) return invalid('The vision reply must be one JSON object.');
  if (Object.prototype.hasOwnProperty.call(value, 'actions') || !('summary' in value)) return invalid('The vision reply must contain a summary and at most one action.');
  if (typeof value.summary !== 'string' || value.summary.length > MAX_SUMMARY_CHARS) return invalid('The vision summary must be text under 2,000 characters.');
  if (Object.prototype.hasOwnProperty.call(value, 'action')) {
    if (!hasExactKeys(value, ['summary', 'action'])) return invalid('The vision reply contains unexpected fields.');
    const action = parseAction(value.action, frame.width, frame.height);
    return action ? { kind: 'action', summary: value.summary, action } : invalid('The requested action is unsupported or outside the captured window.');
  }
  if (!hasExactKeys(value, ['summary'])) return invalid('The vision reply contains unexpected fields.');
  return { kind: 'done', summary: value.summary };
}
