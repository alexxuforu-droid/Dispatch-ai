import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProviderUsage, UsageBasis } from '../providers/openai-compatible';

// Deliberately namespaced away from `dispatch.run.*`. runStore.saveRunSnapshot evicts the
// run index at 30 and removesItem's both the snapshot and the event log
// (runStore.ts:40-44). Nothing run-scoped may own this ledger, or totals silently vanish at
// run #31. Rows reference runId; nothing deletes them by run.
const USAGE_KEY = 'dispatch.usage.v1';

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(work);
  queue = next.catch(() => undefined);
  return next;
}

export type UsagePhase = 'plan' | 'run';

export type UsageRecord = {
  // null for planning rows: makePlan is called at model-runner.ts:491, before any
  // Coordinator exists, so a planning call genuinely has no run. Inventing a runId there
  // would be fabricated identity, so planning rows carry a phase instead.
  runId: string | null;
  agentId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  basis: UsageBasis;
  phase: UsagePhase;
  at: number;
};

// Two independent aggregates and no `total` field on purpose: a combined number is one no
// component supports, and a type that cannot express it cannot leak one into the UI.
export type UsageTotals = {
  exact: number;
  estimated: number;
  callCount: number;
};

export function recordUsage(record: Omit<UsageRecord, 'at'> & { at?: number }): Promise<UsageRecord> {
  return serialize(async () => {
    const saved: UsageRecord = { ...record, at: record.at ?? Date.now() };
    try {
      const records = JSON.parse(await AsyncStorage.getItem(USAGE_KEY) ?? '[]') as UsageRecord[];
      records.push(saved);
      // ponytail: unbounded append-only, so each call rewrites the whole array. Fine at this
      // scale (a run is roughly 5-50 calls). If write latency is ever measured growing with
      // usage, add a retention window here. Never reuse the 30-run cap: that one deletes.
      await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(records));
    } catch {
      // Accounting is best-effort and must never fail a run that already happened. The
      // count goes missing, not wrong; the run is still real.
    }
    return saved;
  });
}

export function readUsage(): Promise<UsageRecord[]> {
  // Unlike recordUsage, a failed read propagates: the usage screen must be able to say
  // "could not read" rather than showing a confident empty state over lost data.
  return serialize(async () => parseUsageRecords(JSON.parse(await AsyncStorage.getItem(USAGE_KEY) ?? '[]')));
}

// A single malformed row must never be able to poison the whole screen. Without this, a
// totalTokens stored as a string concatenates the aggregate into "1520", and a missing
// totalTokens turns every total into NaN. Rows are validated where they enter the app.
export function isUsageRecord(value: unknown): value is UsageRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<UsageRecord>;
  return typeof row.agentId === 'string'
    && typeof row.model === 'string'
    && (row.basis === 'exact' || row.basis === 'estimated')
    && (row.phase === 'plan' || row.phase === 'run')
    && Number.isFinite(row.promptTokens) && row.promptTokens! >= 0
    && Number.isFinite(row.completionTokens) && row.completionTokens! >= 0
    && Number.isFinite(row.totalTokens) && row.totalTokens! >= 0
    && Number.isFinite(row.at)
    && (row.runId === null || typeof row.runId === 'string');
}

export function parseUsageRecords(raw: unknown): UsageRecord[] {
  return Array.isArray(raw) ? raw.filter(isUsageRecord) : [];
}

export function clearUsage(): Promise<void> {
  return serialize(async () => {
    try {
      await AsyncStorage.removeItem(USAGE_KEY);
    } catch {
      // Best-effort, same reason as recordUsage.
    }
  });
}

export function toUsageRecord(input: {
  runId: string | null;
  agentId: string;
  model: string;
  usage: ProviderUsage;
  phase: UsagePhase;
  at?: number;
}): Omit<UsageRecord, 'at'> & { at?: number } {
  return {
    runId: input.runId,
    agentId: input.agentId,
    model: input.model,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    totalTokens: input.usage.totalTokens,
    basis: input.usage.basis,
    phase: input.phase,
    at: input.at,
  };
}

function accumulate(target: UsageTotals, record: UsageRecord): void {
  // Defence in depth: isUsageRecord already guarantees finite numbers, and this keeps a
  // hand-built or legacy row from concatenating or poisoning the sum.
  if (!Number.isFinite(record.totalTokens)) return;
  if (record.basis === 'exact') target.exact += record.totalTokens;
  else target.estimated += record.totalTokens;
  target.callCount += 1;
}

export function rollUpUsage(records: UsageRecord[]): UsageTotals {
  const totals: UsageTotals = { exact: 0, estimated: 0, callCount: 0 };
  for (const record of records) if (isUsageRecord(record)) accumulate(totals, record);
  return totals;
}

export function rollUpForRun(records: UsageRecord[], runId: string): UsageTotals {
  return rollUpUsage(records.filter(record => record.runId === runId));
}

// Estimated figures are rounded to two significant digits so the screen never implies a
// precision a length heuristic cannot deliver. 8432 -> 8400.
export function toTwoSignificantDigits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Fractional magnitudes below 10 would be clamped to one significant digit by the
  // magnitude exponent, so scale those up before rounding and scale the result back.
  const scale = value < 10 ? 10 : 1;
  const scaled = value * scale;
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(scaled)) - 1));
  return Math.round(scaled / magnitude) * magnitude / scale;
}

// Non-finite input has no honest rendering. Returning a number here would put a confident
// "0" or "NaN" on a cost-control card with no failure signal.
export function formatTokenCount(value: number, basis: UsageBasis): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  if (basis === 'estimated') return `${sign}≈ ${Math.round(toTwoSignificantDigits(magnitude)).toLocaleString('en-US')} (est.)`;
  return `${sign}${Math.round(magnitude).toLocaleString('en-US')}`;
}