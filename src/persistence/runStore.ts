import AsyncStorage from '@react-native-async-storage/async-storage';
import { Run, RunEvent } from '../orchestration/types';
import { EventStore } from '../orchestration/event-store';

const RUN_INDEX = 'dispatch.runs.index.v1';
const runKey = (id: string) => `dispatch.run.${id}.snapshot.v1`;
const eventKey = (id: string) => `dispatch.run.${id}.events.v1`;

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(work);
  queue = next.catch(() => undefined);
  return next;
}

export class PersistentRunEventStore implements EventStore {
  append(event: Omit<RunEvent, 'seq'>): Promise<RunEvent> {
    return serialize(async () => {
      const events = JSON.parse(await AsyncStorage.getItem(eventKey(event.runId)) ?? '[]') as RunEvent[];
      const snapshot = JSON.parse(JSON.stringify(event)) as Omit<RunEvent, 'seq'>;
      const saved = { ...snapshot, seq: (events[events.length - 1]?.seq ?? 0) + 1 };
      events.push(saved);
      await AsyncStorage.setItem(eventKey(event.runId), JSON.stringify(events));
      return saved;
    });
  }

  read(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    return serialize(async () => {
      const events = JSON.parse(await AsyncStorage.getItem(eventKey(runId)) ?? '[]') as RunEvent[];
      return events.filter(event => event.seq > afterSeq);
    });
  }
}

export function saveRunSnapshot(run: Run): Promise<void> {
  const snapshot = JSON.stringify(run);
  return serialize(async () => {
    const ids = JSON.parse(await AsyncStorage.getItem(RUN_INDEX) ?? '[]') as string[];
    const nextIds = [run.id, ...ids.filter(id => id !== run.id)].slice(0, 30);
    await AsyncStorage.setItem(runKey(run.id), snapshot);
    await AsyncStorage.setItem(RUN_INDEX, JSON.stringify(nextIds));
    const evicted = ids.filter(id => !nextIds.includes(id));
    for (const id of evicted) { await AsyncStorage.removeItem(runKey(id)); await AsyncStorage.removeItem(eventKey(id)); }
  });
}

export async function loadRunHistory(): Promise<Run[]> {
  const loaded = await serialize(async () => {
    const ids = JSON.parse(await AsyncStorage.getItem(RUN_INDEX) ?? '[]') as string[];
    const snapshots = await Promise.all(ids.map(id => AsyncStorage.getItem(runKey(id))));
    return snapshots.flatMap(value => {
      if (!value) return [];
      try { return [JSON.parse(value) as Run]; } catch { return []; }
    });
  });
  const recovered = loaded.map(recoverInterruptedRun);
  for (const run of [...recovered].reverse()) {
    const original = loaded.find(candidate => candidate.id === run.id);
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
  return recovered;
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
