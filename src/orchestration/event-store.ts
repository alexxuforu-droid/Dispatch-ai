import { RunEvent } from './types';

/** Append-only run history. A durable SQLite adapter can implement this contract later. */
export interface EventStore {
  append(event: Omit<RunEvent, 'seq'>): Promise<RunEvent>;
  read(runId: string, afterSeq?: number): Promise<RunEvent[]>;
}

export class MemoryEventStore implements EventStore {
  private events: RunEvent[] = [];
  async append(event: Omit<RunEvent, 'seq'>): Promise<RunEvent> {
    // Capture event-time state: callers often keep mutating their run object afterwards.
    const snapshot = JSON.parse(JSON.stringify(event)) as Omit<RunEvent, 'seq'>;
    const saved = { ...snapshot, seq: (this.events[this.events.length - 1]?.seq ?? 0) + 1 };
    this.events.push(saved);
    return saved;
  }
  async read(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    return this.events.filter(event => event.runId === runId && event.seq > afterSeq);
  }
}
