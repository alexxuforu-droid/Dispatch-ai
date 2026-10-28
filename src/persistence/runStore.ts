import AsyncStorage from '@react-native-async-storage/async-storage';
import { CodeChange, Run, RunEvent } from '../orchestration/types';
import { EventStore } from '../orchestration/event-store';
import { CorruptStorageError, StorageRead, preserveReadableSlot, quarantineUnreadable, readJsonSlot } from './storageSafety';

const RUN_INDEX = 'dispatch.runs.index.v1';
const runKey = (id: string) => `dispatch.run.${id}.snapshot.v1`;
const eventKey = (id: string) => `dispatch.run.${id}.events.v1`;
const eventIndexKey = (id: string) => `dispatch.run.${id}.eventindex.v1`;
const eventSegmentKey = (id: string, segment: number) => `dispatch.run.${id}.events.v1.${segment}`;

// Retention: the newest MAX_EVENTS_PER_RUN events of a run are kept, and a terminal event
// (run.status -> completed/failed/cancelled) is never dropped, however old it is.
export const MAX_EVENTS_PER_RUN = 400;
// One segment holds this many events, so an append rewrites one bounded segment, never the run.
export const EVENT_SEGMENT_SIZE = 40;
export const MAX_RUNS = 30;
export const MAX_RUN_SNAPSHOT_BYTES = 1024 * 1024;
export const MAX_CHANGE_PAYLOAD_BYTES = 64 * 1024;
export const MAX_SNAPSHOT_CHANGES = 100;
export const MAX_SNAPSHOT_MESSAGES = 200;
export const MAX_SNAPSHOT_ITEMS = 200;
export const MAX_SNAPSHOT_ARTIFACTS = 100;
export const ELIDED_CHANGE_PAYLOAD = '[elided: change payload too large to store]';

export type StoredCodeChange = CodeChange & { payloadElided?: boolean };
export type StoredRunSnapshot = Run & { snapshotTrimmed?: boolean; droppedChanges?: number };

type EventIndex = { segments: number[]; floor: number; count: number; lastSeq: number };

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(work);
  queue = next.catch(() => undefined);
  return next;
}

function emptyIndex(): EventIndex {
  return { segments: [], floor: 0, count: 0, lastSeq: 0 };
}

/** A terminal event is the end of a run: it is never dropped by the retention rule. */
export function isTerminalEvent(event: RunEvent): boolean {
  if (event.type !== 'run.status') return false;
  const payload = event.payload as { status?: unknown } | null;
  return !!payload && typeof payload === 'object' && TERMINAL_RUN_STATUSES.has(String(payload.status));
}

/** A change whose stored payload was elided must never be applied or undone. */
export function isChangePayloadElided(change: unknown): boolean {
  return !!change && typeof change === 'object' && (change as StoredCodeChange).payloadElided === true;
}

function isRunEvent(value: unknown): value is RunEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<RunEvent>;
  return typeof event.seq === 'number' && Number.isFinite(event.seq) && typeof event.runId === 'string' && typeof event.type === 'string';
}

function jsonSize(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

/** Keeps an oversized change readable by recording the elision instead of storing half a file. */
function boundChange(change: CodeChange): StoredCodeChange {
  if (change.before.length + change.after.length <= MAX_CHANGE_PAYLOAD_BYTES) return change;
  return { ...change, before: ELIDED_CHANGE_PAYLOAD, after: ELIDED_CHANGE_PAYLOAD, payloadElided: true };
}

/** Bounds the stored snapshot. Everything dropped is recorded on the snapshot itself. */
export function boundRunSnapshot(run: Run): StoredRunSnapshot {
  // A run without changes stays a run without changes: the stored shape is the loaded shape.
  const hasChanges = Array.isArray(run.changes);
  let changes = hasChanges ? (run.changes ?? []).map(boundChange) : undefined;
  if (changes && changes.length > MAX_SNAPSHOT_CHANGES) changes = changes.slice(changes.length - MAX_SNAPSHOT_CHANGES);
  const build = (next?: StoredCodeChange[]): StoredRunSnapshot => (hasChanges ? { ...run, changes: next ?? [] } : { ...run });
  let value = build(changes);
  if (jsonSize(value) <= MAX_RUN_SNAPSHOT_BYTES) return value;
  while (changes && jsonSize(value) > MAX_RUN_SNAPSHOT_BYTES && changes.length > 1) {
    changes = changes.slice(1);
    value = { ...build(changes), droppedChanges: (value.droppedChanges ?? 0) + 1 };
  }
  if (jsonSize(value) > MAX_RUN_SNAPSHOT_BYTES) {
    value = {
      ...value,
      messages: value.messages.slice(-MAX_SNAPSHOT_MESSAGES),
      items: value.items.slice(-MAX_SNAPSHOT_ITEMS),
      artifacts: value.artifacts.slice(-MAX_SNAPSHOT_ARTIFACTS),
      snapshotTrimmed: true,
    };
  }
  return value;
}

async function readEventIndexUnserialized(runId: string): Promise<{ index: EventIndex; corrupt: boolean; quarantineKey: string }> {
  const result = await readJsonSlot<EventIndex>(eventIndexKey(runId), raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CorruptStorageError('the event index is not an object');
    const value = raw as Partial<EventIndex>;
    if (!Array.isArray(value.segments)) throw new CorruptStorageError('the event index has no segment list');
    const segments = value.segments.filter((segment): segment is number => typeof segment === 'number' && Number.isInteger(segment) && segment >= 0);
    return {
      segments,
      floor: typeof value.floor === 'number' && value.floor >= 0 ? value.floor : 0,
      count: typeof value.count === 'number' && value.count >= 0 ? value.count : 0,
      lastSeq: typeof value.lastSeq === 'number' && value.lastSeq >= 0 ? value.lastSeq : 0,
    };
  }, emptyIndex());
  if (result.status === 'corrupt') {
    const rebuilt = await rebuildEventIndex(runId);
    return { index: rebuilt, corrupt: true, quarantineKey: result.quarantineKey };
  }
  return { index: result.value, corrupt: false, quarantineKey: '' };
}

/** Rebuilds the index from the segment keys, so a broken index never loses the events. */
async function rebuildEventIndex(runId: string): Promise<EventIndex> {
  const prefix = `dispatch.run.${runId}.events.v1.`;
  const keys = await AsyncStorage.getAllKeys();
  const segments = keys
    .filter(key => key.startsWith(prefix))
    .map(key => Number(key.slice(prefix.length)))
    .filter(segment => Number.isInteger(segment) && segment >= 0)
    .sort((left, right) => left - right);
  const index = emptyIndex();
  for (const segment of segments) {
    const events = await readSegment(runId, segment);
    if (!events.length) continue;
    index.segments.push(segment);
    index.count += events.length;
    index.lastSeq = Math.max(index.lastSeq, ...events.map(event => event.seq));
  }
  return index;
}

async function readSegment(runId: string, segment: number): Promise<RunEvent[]> {
  const raw = await AsyncStorage.getItem(eventSegmentKey(runId, segment));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRunEvent) : [];
  } catch {
    await quarantineUnreadable(eventSegmentKey(runId, segment), raw);
    return [];
  }
}

/** Drops the oldest events until the run is back inside the retention window. */
async function pruneEventLog(runId: string, index: EventIndex): Promise<EventIndex> {
  let count = index.count;
  let floor = index.floor;
  const segments = [...index.segments];
  while (count > MAX_EVENTS_PER_RUN && floor < segments.length - 1) {
    const oldest = segments[floor];
    const events = await readSegment(runId, oldest);
    const kept = events.filter(isTerminalEvent);
    if (kept.length === events.length) { floor += 1; continue; }
    await AsyncStorage.setItem(eventSegmentKey(runId, oldest), JSON.stringify(kept));
    count -= events.length - kept.length;
    if (!kept.length) {
      await AsyncStorage.removeItem(eventSegmentKey(runId, oldest));
      segments.splice(floor, 1);
    }
  }
  return { ...index, segments, floor, count };
}

async function writeLegacyEvents(runId: string, index: EventIndex, legacy: RunEvent[]): Promise<EventIndex> {
  const segments: number[] = [];
  for (let start = 0; start < legacy.length; start += EVENT_SEGMENT_SIZE) {
    const chunk = legacy.slice(start, start + EVENT_SEGMENT_SIZE);
    const segment = segments.length;
    await AsyncStorage.setItem(eventSegmentKey(runId, segment), JSON.stringify(chunk));
    segments.push(segment);
  }
  const migrated: EventIndex = {
    segments,
    floor: 0,
    count: legacy.length,
    lastSeq: legacy.reduce((highest, event) => Math.max(highest, event.seq), 0),
  };
  const pruned = await pruneEventLog(runId, migrated);
  // The index is written before the legacy slot is emptied, so a crash in between leaves
  // both readable instead of orphaning the segments.
  await AsyncStorage.setItem(eventIndexKey(runId), JSON.stringify(pruned));
  await AsyncStorage.removeItem(eventKey(runId));
  return pruned;
}

/** Reads the legacy single-array event log of an install that has not been migrated yet. */
async function readLegacyEvents(runId: string): Promise<{ events: RunEvent[]; corrupt: boolean; quarantineKey: string }> {
  const raw = await AsyncStorage.getItem(eventKey(runId));
  if (!raw) return { events: [], corrupt: false, quarantineKey: '' };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new CorruptStorageError('the event log is not a list');
    return { events: parsed.filter(isRunEvent), corrupt: false, quarantineKey: '' };
  } catch {
    return { events: [], corrupt: true, quarantineKey: await quarantineUnreadable(eventKey(runId), raw) };
  }
}

export class PersistentRunEventStore implements EventStore {
  append(event: Omit<RunEvent, 'seq'>): Promise<RunEvent> {
    return serialize(async () => {
      const prepared = await readEventIndexUnserialized(event.runId);
      let index = prepared.index;
      const legacy = await readLegacyEvents(event.runId);
      if (legacy.events.length) {
        index = index.segments.length ? index : await writeLegacyEvents(event.runId, index, legacy.events);
        if (index.segments.length) await AsyncStorage.removeItem(eventKey(event.runId));
      }
      const snapshot = JSON.parse(JSON.stringify(event)) as Omit<RunEvent, 'seq'>;
      const saved = { ...snapshot, seq: index.lastSeq + 1 };
      let segmentNumber = index.segments.length ? index.segments[index.segments.length - 1] : 0;
      let segment = index.segments.length ? await readSegment(event.runId, segmentNumber) : [];
      if (segment.length >= EVENT_SEGMENT_SIZE) {
        segmentNumber += 1;
        segment = [];
      }
      if (!index.segments.includes(segmentNumber)) index.segments.push(segmentNumber);
      segment.push(saved);
      await AsyncStorage.setItem(eventSegmentKey(event.runId, segmentNumber), JSON.stringify(segment));
      index.count += 1;
      index.lastSeq = saved.seq;
      index = await pruneEventLog(event.runId, index);
      await AsyncStorage.setItem(eventIndexKey(event.runId), JSON.stringify(index));
      return saved;
    });
  }

  read(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    return serialize(async () => (await readRunEventsResult(runId, afterSeq)).value);
  }
}

/** Reads a run's events with the corruption status, so the UI can tell "no events" from "lost events". */
export async function readRunEventsResult(runId: string, afterSeq = 0): Promise<StorageRead<RunEvent[]>> {
  const prepared = await readEventIndexUnserialized(runId);
  const legacy = await readLegacyEvents(runId);
  const events: RunEvent[] = [];
  for (const segment of prepared.index.segments) events.push(...await readSegment(runId, segment));
  events.push(...legacy.events);
  const seen = new Set<number>();
  const unique = events
    .filter(event => !seen.has(event.seq) && seen.add(event.seq))
    .sort((left, right) => left.seq - right.seq)
    .filter(event => event.seq > afterSeq);
  const corrupt = prepared.corrupt || legacy.corrupt;
  if (corrupt) return { status: 'corrupt', value: unique, quarantineKey: prepared.quarantineKey || legacy.quarantineKey, reason: 'A stored run event log was unreadable and has been quarantined.' };
  return { status: unique.length ? 'ok' : 'empty', value: unique };
}

async function readRunIndexUnserialized(): Promise<{ ids: string[]; corrupt: boolean; quarantineKey: string }> {
  const result = await readJsonSlot<string[]>(RUN_INDEX, raw => {
    if (!Array.isArray(raw) || raw.some(id => typeof id !== 'string')) throw new CorruptStorageError('the run index is not a list of ids');
    return raw as string[];
  }, []);
  return { ids: result.value, corrupt: result.status === 'corrupt', quarantineKey: result.status === 'corrupt' ? result.quarantineKey : '' };
}

export function saveRunSnapshot(run: Run): Promise<void> {
  const snapshot = JSON.stringify(boundRunSnapshot(run));
  return serialize(async () => {
    await preserveReadableSlot(runKey(run.id));
    const index = await readRunIndexUnserialized();
    const nextIds = [run.id, ...index.ids.filter(id => id !== run.id)].slice(0, MAX_RUNS);
    await AsyncStorage.setItem(runKey(run.id), snapshot);
    await AsyncStorage.setItem(RUN_INDEX, JSON.stringify(nextIds));
    const evicted = index.ids.filter(id => !nextIds.includes(id));
    for (const id of evicted) await removeRunData(id);
  });
}

/** Loads the run history with the corruption status, so the UI can offer a repair path. */
export async function loadRunHistoryResult(): Promise<StorageRead<Run[]>> {
  const loaded = await serialize(async () => {
    const index = await readRunIndexUnserialized();
    const snapshots = await Promise.all(index.ids.map(id => AsyncStorage.getItem(runKey(id))));
    const runs: Run[] = [];
    let corrupt = index.corrupt;
    let quarantineKey = index.quarantineKey;
    for (let position = 0; position < index.ids.length; position += 1) {
      const value = snapshots[position];
      if (!value) continue;
      try {
        runs.push(JSON.parse(value) as Run);
      } catch {
        corrupt = true;
        quarantineKey = quarantineKey || await quarantineUnreadable(runKey(index.ids[position]), value);
      }
    }
    return { runs, corrupt, quarantineKey };
  });
  const recovered = loaded.runs.map(recoverInterruptedRun);
  for (const run of [...recovered].reverse()) {
    const original = loaded.runs.find(candidate => candidate.id === run.id);
    if (original && (original.status === 'running' || original.status === 'reviewing')) {
      try {
        const at = run.recoveredAt ?? new Date().toISOString();
        await saveRunSnapshot(run);
        const store = new PersistentRunEventStore();
        await store.append({ runId: run.id, type: 'run.status', payload: { status: run.status, recovered: true }, at });
        for (const item of run.items.filter(candidate => candidate.status === 'cancelled' && original.items.find(old => old.id === candidate.id)?.status === 'running')) {
          await store.append({ runId: run.id, type: 'work.finished', payload: { item }, at });
        }
        await store.append({ runId: run.id, type: 'agent.message', payload: run.messages[run.messages.length - 1], at });
      } catch { /* Keep the recovered state in memory even if local persistence is temporarily unavailable. */ }
    }
  }
  if (loaded.corrupt) {
    return { status: 'corrupt', value: recovered, quarantineKey: loaded.quarantineKey, reason: 'A stored run could not be read and has been quarantined.' };
  }
  return { status: recovered.length ? 'ok' : 'empty', value: recovered };
}

export async function loadRunHistory(): Promise<Run[]> {
  return (await loadRunHistoryResult()).value;
}

async function removeRunData(id: string): Promise<void> {
  await AsyncStorage.removeItem(runKey(id));
  await AsyncStorage.removeItem(eventKey(id));
  await AsyncStorage.removeItem(eventIndexKey(id));
  const prefix = `dispatch.run.${id}.events.v1.`;
  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys.filter(candidate => candidate.startsWith(prefix))) await AsyncStorage.removeItem(key);
}

/**
 * Moves the whole run history aside and empties the live slots.
 * The backup is kept under the returned key, so a readable history is never destroyed.
 */
export async function quarantineRunHistory(): Promise<{ quarantineKey: string; runs: number }> {
  const at = Date.now();
  const manifestKey = `dispatch.runs.history.quarantine.${at}`;
  const index = await readRunIndexUnserialized();
  const copied: string[] = [];
  for (const id of index.ids) {
    copied.push(...await copyKey(runKey(id), at));
    copied.push(...await copyKey(eventKey(id), at));
    copied.push(...await copyKey(eventIndexKey(id), at));
    const events = await readEventIndexUnserialized(id);
    for (const segment of events.index.segments) copied.push(...await copyKey(eventSegmentKey(id, segment), at));
  }
  copied.push(...await copyKey(RUN_INDEX, at));
  await AsyncStorage.setItem(manifestKey, JSON.stringify({ at, runs: index.ids, keys: copied }));
  for (const id of index.ids) await removeRunData(id);
  await AsyncStorage.removeItem(RUN_INDEX);
  return { quarantineKey: manifestKey, runs: index.ids.length };
}

/**
 * Discards the run history. It quarantines first, so even a discard never destroys a
 * readable history: the copy stays under a `.quarantine.` key.
 */
export async function discardRunHistory(): Promise<void> {
  await quarantineRunHistory();
}

async function copyKey(key: string, at: number): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null || raw === undefined) return [];
  const target = `${key}.quarantine.${at}`;
  await AsyncStorage.setItem(target, raw);
  return [target];
}

function recoverInterruptedRun(run: Run): Run {
  if (run.status !== 'running' && run.status !== 'reviewing') return run;
  const recoveredAt = new Date().toISOString();
  const interrupted = { ...run, status: 'cancelled' as const, recoveredAt, updatedAt: recoveredAt, items: run.items.map(item => item.status === 'running' ? { ...item, status: 'cancelled' as const } : item) };
  const message: Run['messages'][number] = {
    id: `msg-${interrupted.messages.length + 1}`, runId: interrupted.id, from: 'Dispatch', to: 'team', kind: 'update', createdAt: recoveredAt,
    text: 'Dispatch closed while this run was active. Finished and reviewed work is preserved; you can resume unfinished steps when ready.',
  };
  interrupted.messages = [...interrupted.messages, message];
  return interrupted;
}
