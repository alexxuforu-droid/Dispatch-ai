/**
 * Headless tests for token accounting: the parse that decides basis, the estimate fallback,
 * the dedicated usage ledger, and the split-total rollup.
 *
 * The load-bearing rules under test:
 *  - basis is decided at the parse and never defaults to 'exact';
 *  - a provider that omits usage produces an estimate, never a fabricated zero;
 *  - usage rows survive the 30-run snapshot eviction that deletes run data;
 *  - exact and estimated are never summed into one number.
 */

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);
jest.mock('../src/persistence/providerCredentials', () => ({ loadProviderSecret: jest.fn(async () => 'test-key') }));

import {
  CHARS_PER_TOKEN,
  completeChat,
  estimateChatUsage,
  estimateTokens,
  parseModelIds,
  parseProviderUsage,
} from '../src/providers/openai-compatible';
import { clearUsage, formatTokenCount, isUsageRecord, parseUsageRecords, readUsage, recordUsage, rollUpForRun, rollUpUsage, toTwoSignificantDigits, toUsageRecord } from '../src/persistence/usageLedger';
import { storageFailures, resetAsyncStorageMock } from './asyncStorageMock';
import { loadRunHistory, saveRunSnapshot } from '../src/persistence/runStore';
import type { ProviderProfile } from '../src/persistence/providerProfile';
import type { Run } from '../src/orchestration/types';

const ENDPOINT = 'https://api.openai.com/v1';
const profile: ProviderProfile = { endpoint: ENDPOINT, model: 'gpt-4o', imageModel: '' };

function stubFetch(payload: unknown, status = 200): void {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));
}

function chatReply(content: string | { type: string; text: string }[], usage?: unknown): Record<string, unknown> {
  return { choices: [{ message: { content } }], ...(usage === undefined ? {} : { usage }) };
}

const makeRun = (id: string): Run => ({
  id,
  brief: 'ship the slice',
  status: 'completed',
  teamId: 'team',
  items: [],
  messages: [],
  artifacts: [],
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
});

beforeEach(async () => {
  await clearUsage();
});

describe('parseProviderUsage decides basis at the parse', () => {
  test('reads reported numbers as exact', () => {
    expect(parseProviderUsage({ usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 } }))
      .toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165, basis: 'exact' });
  });

  test('derives the total when the provider omits only total_tokens', () => {
    expect(parseProviderUsage({ usage: { prompt_tokens: 10, completion_tokens: 5 } }))
      .toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, basis: 'exact' });
  });

  test('never claims exact when usage is absent or unusable', () => {
    expect(parseProviderUsage({ choices: [] })).toBeNull();
    expect(parseProviderUsage({})).toBeNull();
    expect(parseProviderUsage(null)).toBeNull();
    expect(parseProviderUsage({ usage: { prompt_tokens: 'many', completion_tokens: 5 } })).toBeNull();
    expect(parseProviderUsage({ usage: { prompt_tokens: -1, completion_tokens: 5 } })).toBeNull();
    expect(parseProviderUsage({ usage: { prompt_tokens: null, completion_tokens: null } })).toBeNull();
  });
});

describe('the estimate fallback', () => {
  test('is always labelled estimated and never zero', () => {
    const usage = estimateChatUsage([{ role: 'user', content: 'hi' }], 'ok');
    expect(usage.basis).toBe('estimated');
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
  });

  test('scales with input length using a fixed chars-per-token ratio', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(CHARS_PER_TOKEN * 3))).toBe(3);
    expect(estimateTokens('')).toBe(1);
  });
});

describe('completeChat reports what the provider actually returned', () => {
  test('a provider that reports usage yields exact counts and the serving model', async () => {
    stubFetch(chatReply('done', { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 }));
    const result = await completeChat(profile, [{ role: 'user', content: 'hello' }]);
    expect(result.content).toBe('done');
    expect(result.model).toBe('gpt-4o');
    expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165, basis: 'exact' });
  });

  test('a provider that omits usage yields a labelled estimate, not zero and not exact', async () => {
    stubFetch(chatReply('done'));
    const result = await completeChat(profile, [{ role: 'user', content: 'hello' }]);
    expect(result.usage.basis).toBe('estimated');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  test('array-shaped message content still returns joined text', async () => {
    stubFetch(chatReply([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]));
    const result = await completeChat(profile, [{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('ab');
  });
});

describe('the usage ledger', () => {
  test('round-trips a record with its basis intact', async () => {
    await recordUsage(toUsageRecord({
      runId: 'run-1',
      agentId: 'builder',
      model: 'gpt-4o',
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14, basis: 'exact' },
      phase: 'run',
    }));
    const rows = await readUsage();
    expect(rows).toHaveLength(1);
    expect(rows[0].basis).toBe('exact');
    expect(rows[0].runId).toBe('run-1');
    expect(typeof rows[0].at).toBe('number');
  });

  test('planning rows carry no runId but do carry a phase', async () => {
    await recordUsage(toUsageRecord({
      runId: null,
      agentId: 'planner',
      model: 'gpt-4o',
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10, basis: 'estimated' },
      phase: 'plan',
    }));
    const rows = await readUsage();
    expect(rows[0].runId).toBeNull();
    expect(rows[0].phase).toBe('plan');
  });

  // AC5. runStore.saveRunSnapshot trims the index to 30 and removesItem's both the snapshot
  // and the event log for each evicted run. Token history must not be a casualty of that.
  test('usage rows survive after run snapshots are evicted past the 30-run cap', async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordUsage(toUsageRecord({
        runId: `run-${i}`,
        agentId: 'builder',
        model: 'gpt-4o',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, basis: 'exact' },
        phase: 'run',
      }));
    }
    for (let i = 0; i < 31; i += 1) await saveRunSnapshot(makeRun(`run-${i}`));

    const history = await loadRunHistory();
    expect(history).toHaveLength(30);
    expect(history.map(run => run.id)).not.toContain('run-0');

    const rows = await readUsage();
    expect(rows).toHaveLength(5);
    expect(rows.map(row => row.runId).sort()).toEqual(['run-0', 'run-1', 'run-2', 'run-3', 'run-4']);
  });
});

describe('rollup keeps the two bases apart', () => {
  const row = (basis: 'exact' | 'estimated', totalTokens: number, runId: string | null = 'run-1') => ({
    runId,
    agentId: 'a',
    model: 'm',
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    basis,
    phase: 'run' as const,
    at: 0,
  });

  test('sums each basis into its own aggregate and never together', () => {
    const totals = rollUpUsage([row('exact', 100), row('estimated', 40), row('exact', 60)]);
    expect(totals).toEqual({ exact: 160, estimated: 40, callCount: 3 });
    // A combined figure is not merely unused here; UsageTotals has no field that could hold it.
    expect(Object.keys(totals).sort()).toEqual(['callCount', 'estimated', 'exact']);
  });

  test('an empty ledger rolls up to zeroes rather than throwing', () => {
    expect(rollUpUsage([])).toEqual({ exact: 0, estimated: 0, callCount: 0 });
  });

  test('per-run rollup counts only that run', () => {
    const totals = rollUpForRun([row('exact', 10, 'run-1'), row('exact', 90, 'run-2')], 'run-1');
    expect(totals).toEqual({ exact: 10, estimated: 0, callCount: 1 });
  });

  test('planning rows are excluded from a per-run rollup but counted overall', () => {
    const rows = [row('estimated', 7, 'run-1'), row('estimated', 3, null)];
    expect(rollUpForRun(rows, 'run-1')).toEqual({ exact: 0, estimated: 7, callCount: 1 });
    expect(rollUpUsage(rows)).toEqual({ exact: 0, estimated: 10, callCount: 2 });
  });
});

describe('a malformed row can never poison the screen', () => {
  const good = { runId: 'r1', agentId: 'a', model: 'm', promptTokens: 10, completionTokens: 5, totalTokens: 15, basis: 'exact' as const, phase: 'run' as const, at: 1 };

  test('a well-formed row survives validation', () => {
    expect(isUsageRecord(good)).toBe(true);
    expect(parseUsageRecords([good])).toEqual([good]);
  });

  test('a row with a string total is rejected rather than concatenated into the sum', () => {
    const bad = { ...good, totalTokens: '15' };
    expect(isUsageRecord(bad)).toBe(false);
    // The original hazard: '0' + '15' + '15' === '015'.
    expect(rollUpUsage([good, bad as never]).exact).toBe(15);
  });

  test('a row missing its total cannot turn the whole screen into NaN', () => {
    const { totalTokens, ...missing } = good;
    expect(totalTokens).toBe(15);
    const totals = rollUpUsage([good, missing as never]);
    expect(totals.exact).toBe(15);
    expect(Number.isFinite(totals.exact)).toBe(true);
  });

  test('an unknown basis is rejected outright, never silently filed as an estimate', () => {
    expect(isUsageRecord({ ...good, basis: 'rough' })).toBe(false);
    expect(parseUsageRecords([{ ...good, basis: 'rough' }])).toEqual([]);
  });

  test('non-array and non-object payloads yield no rows instead of throwing', () => {
    expect(parseUsageRecords(null)).toEqual([]);
    expect(parseUsageRecords('nope')).toEqual([]);
    expect(parseUsageRecords([null, undefined, 7, good])).toEqual([good]);
  });
});

describe('degenerate figures are never dressed up as real ones', () => {
  test('a non-finite value renders as a dash, never as a confident zero or NaN', () => {
    expect(formatTokenCount(Number.NaN, 'exact')).toBe('—');
    expect(formatTokenCount(Number.POSITIVE_INFINITY, 'exact')).toBe('—');
    expect(formatTokenCount(Number.NaN, 'estimated')).toBe('—');
    expect(formatTokenCount(Number.POSITIVE_INFINITY, 'estimated')).toBe('—');
  });

  test('sub-ten magnitudes keep two significant digits', () => {
    expect(toTwoSignificantDigits(9.4)).toBe(9.4);
    expect(toTwoSignificantDigits(1.05)).toBe(1.1);
    expect(toTwoSignificantDigits(84)).toBe(84);
    expect(toTwoSignificantDigits(8432)).toBe(8400);
  });

  test('a negative figure keeps its sign rather than reading as a small positive', () => {
    expect(formatTokenCount(-1500, 'exact')).toBe('-1,500');
    expect(formatTokenCount(-1500, 'estimated')).toBe('-≈ 1,500 (est.)');
  });
});

describe('a provider total that disagrees with prompt+completion is not trusted', () => {
  test('an implausible total is derived instead of believed', () => {
    expect(parseProviderUsage({ usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 999999999999 } }))
      .toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165, basis: 'exact' });
    expect(parseProviderUsage({ usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 3 } }))
      .toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165, basis: 'exact' });
    expect(parseProviderUsage({ usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: -100 } }))
      .toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165, basis: 'exact' });
  });

  test('a plausible total, including one above the sum for cached tokens, is kept', () => {
    expect(parseProviderUsage({ usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 200 } })?.totalTokens).toBe(200);
  });
});

describe('the catalog parse is not quadratic in provider-controlled size', () => {
  test('a very large /models listing de-duplicates without blowing up', () => {
    const data = Array.from({ length: 20_000 }, (_, index) => ({ id: `model-${index % 5_000}` }));
    const started = Date.now();
    const ids = parseModelIds({ data });
    expect(ids).toHaveLength(5_000);
    // Linear enough to be unnoticeable; the old includes() dedupe took over a second here.
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('presentation never overstates precision', () => {
  test('rounds estimates down to two significant digits', () => {
    expect(toTwoSignificantDigits(8432)).toBe(8400);
    expect(toTwoSignificantDigits(1200)).toBe(1200);
    expect(toTwoSignificantDigits(84)).toBe(84);
    expect(toTwoSignificantDigits(0)).toBe(0);
    expect(toTwoSignificantDigits(-5)).toBe(0);
  });

  test('an estimate is prefixed and suffixed; an exact count is neither', () => {
    expect(formatTokenCount(8432, 'estimated')).toBe('≈ 8,400 (est.)');
    expect(formatTokenCount(8432, 'exact')).toBe('8,432');
  });

  test('the estimate label survives without colour', () => {
    // Distinction is carried by the ≈ prefix and the (est.) suffix, not by a hue.
    expect(formatTokenCount(100, 'estimated')).toMatch(/^≈ .*\(est\.\)$/);
    expect(formatTokenCount(100, 'exact')).not.toMatch(/≈|\(est\.\)/);
  });
});

// The asymmetry is deliberate and is the reason the usage screen has a failure state at all.
// recordUsage swallows so a provider call that already happened is never sunk by its own
// accounting; readUsage propagates so the screen can say "could not read" instead of showing
// a confident empty ledger over data it simply failed to load.
describe('the ledger error policy is asymmetric on purpose', () => {
  const row = {
    runId: 'run-x', agentId: 'builder', model: 'gpt-4o',
    promptTokens: 40, completionTokens: 83, totalTokens: 123,
    basis: 'exact' as const, phase: 'run' as const,
  };

  afterEach(() => { resetAsyncStorageMock(); });

  test('recordUsage resolves and returns the row even when the write fails', async () => {
    await clearUsage();
    storageFailures.set = true;
    const saved = await recordUsage(row);
    expect(saved.totalTokens).toBe(123);
    storageFailures.set = false;
    // The count went missing, not wrong. Nothing was stored, and nothing threw.
    expect(await readUsage()).toEqual([]);
  });

  test('recordUsage still resolves when the read-modify-write itself fails', async () => {
    await clearUsage();
    storageFailures.get = true;
    await expect(recordUsage(row)).resolves.toMatchObject({ totalTokens: 123 });
  });

  test('readUsage rejects when the read fails, rather than reporting an empty ledger', async () => {
    storageFailures.get = true;
    await expect(readUsage()).rejects.toThrow('async-storage getItem failed (injected)');
  });

  test('a failed read is not a silently empty read', async () => {
    await recordUsage(row);
    const healthy = await readUsage();
    expect(healthy).toHaveLength(1);
    storageFailures.get = true;
    // The distinction that matters: [] would mean "no usage recorded". A rejection means
    // "unknown", which is the only reading the screen is allowed to show.
    await expect(readUsage()).rejects.toThrow('async-storage getItem failed (injected)');
  });
});