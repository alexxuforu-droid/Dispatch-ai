import { Agent, CodeChange, Run, RunEvent, Team, WorkItem } from './types';
import { EventStore } from './event-store';

export type PlanStep = { title: string; kind: WorkItem['kind']; agentId: string; dependsOn?: number[] };
export type AgentResult = { summary: string; messages?: { to: string | 'team'; text: string; kind: 'handoff' | 'question' | 'finding' | 'update' }[]; artifacts?: Run['artifacts']; changes?: Omit<CodeChange, 'id' | 'itemId' | 'createdBy' | 'attempt'>[] };
export interface AgentExecutor { execute(input: { runId: string; brief: string; step: WorkItem; team: Team; priorMessages: Run['messages']; feedback?: string[]; attempt?: number; signal?: AbortSignal }): Promise<AgentResult> }
export interface RunApproval { request(run: Run, reason: string): Promise<void> }
export interface AutoReviewer { review(input: { run: Run; item: WorkItem; signal?: AbortSignal }): Promise<{ passed: boolean; findings: string[] }> }

/**
 * Optional per-wave concurrency cap. Omitted (or non-positive) means today's behavior:
 * every ready item in a wave starts at once. A positive value bounds each wave to
 * sequential slices of that size; a slice settles before the next one starts.
 */
export type CoordinatorOptions = { maxConcurrency?: number };

/** Provider/model independent coordination. Executors, persistence, and review gates are injected. */
export class Coordinator {
  constructor(private readonly store: EventStore, private readonly executor: AgentExecutor, private readonly reviewer: AutoReviewer, private readonly approval: RunApproval, private readonly options: CoordinatorOptions = {}) {}

  async create(brief: string, team: Team, plan: PlanStep[]): Promise<Run> {
    if (!brief.trim() || !team.agents.length || !plan.length) throw new Error('A task, team, and plan are required.');
    const ids = new Set(team.agents.map(agent => agent.id));
    const items: WorkItem[] = plan.map((step, index) => {
      if (!ids.has(step.agentId)) throw new Error(`Plan step ${index + 1} names an agent outside this team.`);
      if (step.dependsOn?.some(dependency => dependency < 0 || dependency >= index)) throw new Error('Plan dependencies must point to earlier steps.');
      return { id: `work-${index + 1}`, title: step.title, kind: step.kind, agentId: step.agentId, dependsOn: (step.dependsOn ?? []).map(dependency => `work-${dependency + 1}`), status: step.dependsOn?.length ? 'blocked' : 'ready', artifactIds: [] };
    });
    const now = new Date().toISOString();
    const run: Run = { id: `run-${Date.now().toString(36)}`, brief, status: 'queued', teamId: team.id, agentProfiles: team.agents.map(agent => ({ ...agent, kinds: [...agent.kinds] })), agentModelIds: Object.fromEntries(team.agents.flatMap(agent => agent.modelId ? [[agent.id, agent.modelId]] : [])), items, messages: [], artifacts: [], changes: [], createdAt: now, updatedAt: now };
    await this.emit(run.id, 'run.created', { brief, teamId: team.id, plan: items });
    return run;
  }

  async execute(run: Run, team: Team, signal?: AbortSignal): Promise<Run> {
    // The status gate lives outside the try on purpose. A refused resume must reject the call,
    // not fall into the catch below, which would stamp a terminal run (a completed one, say) as
    // failed and persist that lie.
    if (!['queued', 'cancelled', 'failed', 'needs-approval'].includes(run.status)) throw new Error('This run is not waiting to start or resume.');
    try {
      throwIfAborted(signal);
      const resumeStatuses = new Set(['cancelled', 'failed', 'running', 'needs-approval']);
      const isResuming = run.status !== 'queued';
      const retryItems = isResuming ? run.items.filter(item => resumeStatuses.has(item.status)) : [];
      const supersededChangeIds: string[] = [];
      const supersededArtifactIds: string[] = [];
      for (const item of retryItems) {
        const supersededAt = new Date().toISOString();
        const staleChanges = (run.changes ?? []).filter(change => change.itemId === item.id && !change.appliedAt && !change.supersededAt && !change.rejectedAt);
        for (const change of staleChanges) change.supersededAt = supersededAt;
        const staleArtifacts = run.artifacts.filter(artifact => artifact.workItemId === item.id && !artifact.supersededAt);
        for (const artifact of staleArtifacts) artifact.supersededAt = supersededAt;
        supersededChangeIds.push(...staleChanges.map(change => change.id));
        supersededArtifactIds.push(...staleArtifacts.map(artifact => artifact.id));
        item.status = item.dependsOn.every(id => run.items.find(candidate => candidate.id === id)?.status === 'done') ? 'ready' : 'blocked';
      }
      for (const item of run.items.filter(candidate => candidate.status === 'blocked' && candidate.dependsOn.every(id => run.items.find(dependency => dependency.id === id)?.status === 'done'))) item.status = 'ready';
      for (const item of retryItems.filter(candidate => candidate.status === 'ready')) await this.emit(run.id, 'work.ready', { item, resumed: true });
      if (supersededChangeIds.length || supersededArtifactIds.length) await this.emit(run.id, 'run.status', { status: run.status, supersededChangeIds, supersededArtifactIds });
      if (retryItems.length) {
        const resumedAt = new Date().toISOString();
        run.updatedAt = resumedAt;
        const message: Run['messages'][number] = { id: `msg-${run.messages.length + 1}`, runId: run.id, from: 'Dispatch', to: 'team', text: 'You resumed this run. Continue unfinished work, preserve completed steps, and address any retained review findings.', kind: 'update', createdAt: resumedAt };
        run.messages.push(message); await this.emit(run.id, 'agent.message', message);
        await this.emit(run.id, 'run.status', { status: run.status, resumed: true });
      }
      if (isResuming) { delete run.recoveredAt; delete run.checkpointPaused; }
      run.status = 'running'; await this.emit(run.id, 'run.status', { status: run.status });
      while (run.items.some(item => item.status === 'ready' || item.status === 'blocked')) {
        throwIfAborted(signal);
        const ready = run.items.filter(item => item.status === 'ready');
        if (!ready.length) throw new Error('The plan contains a dependency cycle or a failed dependency.');
        // Independent work shares a wave. Every agent sees the same preceding handoffs.
        // A cap bounds the wave to sequential slices; each slice settles before the next starts.
        const cap = this.options.maxConcurrency && this.options.maxConcurrency > 0 ? this.options.maxConcurrency : ready.length;
        const outcomes: PromiseSettledResult<{ item: WorkItem; result: AgentResult; agent: Agent; attempt: number }>[] = [];
        for (let start = 0; start < ready.length; start += cap) outcomes.push(...await Promise.allSettled(ready.slice(start, start + cap).map(async item => {
          const agent = team.agents.find(candidate => candidate.id === item.agentId);
          if (!agent || !supports(agent, item)) throw new Error(`Agent ${item.agentId} cannot perform ${item.kind} work.`);
          item.status = 'running'; await this.emit(run.id, 'work.started', { item });
          const attempt = nextAttempt(run, item);
          const feedback = isResuming ? reviewFeedback(run, item) : [];
          const result = await this.executor.execute({ runId: run.id, brief: run.brief, step: item, team, priorMessages: run.messages, feedback, attempt, signal });
          return { item, result, agent, attempt };
        })));
        const failed = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
        const wave = outcomes.flatMap(outcome => outcome.status === 'fulfilled' ? [outcome.value] : []);
        // Persist every completed sibling before handling an error or cancellation in the same wave.
        for (const { item, result, agent, attempt } of wave) {
          for (const message of result.messages ?? []) {
            const entry = { id: `msg-${run.messages.length + 1}`, runId: run.id, workItemId: item.id, attempt, from: agent.name, ...message, createdAt: new Date().toISOString() };
            run.messages.push(entry); await this.emit(run.id, 'agent.message', entry);
          }
          for (const artifact of result.artifacts ?? []) { const linked = { ...artifact, workItemId: item.id, attempt }; run.artifacts.push(linked); item.artifactIds.push(linked.id); await this.emit(run.id, 'artifact.created', linked); }
          for (const change of result.changes ?? []) {
            run.changes ??= [];
            const proposal: CodeChange = { ...change, id: `change-${run.changes.length + 1}`, itemId: item.id, createdBy: agent.name, attempt };
            run.changes.push(proposal);
            await this.emit(run.id, 'code-change.proposed', proposal);
          }
        }
        throwIfAborted(signal);
        let needsApproval = false;
        for (const { item, agent, attempt: initialAttempt } of wave) {
          const appliedBeforeReview = new Set((run.changes ?? []).filter(change => change.appliedAt).map(change => change.id));
          let verdict = await this.reviewer.review({ run, item, signal });
          const appliedChanges = (run.changes ?? []).filter(change => change.appliedAt && !appliedBeforeReview.has(change.id));
          if (appliedChanges.length) await this.emit(run.id, 'run.status', { status: run.status, appliedChanges });
          throwIfAborted(signal);
          let attempt = initialAttempt;
          let revisions = 0;
          const canRevise = () => item.kind === 'code' || (item.kind === 'image' && run.artifacts.some(artifact => artifact.workItemId === item.id && artifact.kind === 'image' && !artifact.supersededAt));
          while (!verdict.passed && canRevise() && revisions < 2) {
            const feedback = verdict.findings.slice(0, 8);
            for (const finding of feedback) await this.emit(run.id, 'review.finding', { itemId: item.id, finding, attempt });
            const request = { id: `msg-${run.messages.length + 1}`, runId: run.id, workItemId: item.id, attempt: attempt + 1, from: 'Automatic code reviewer', to: agent.name, text: `Please revise your proposal to address these review findings. Keep the change within the original task and the same attached/new files.\n\n${feedback.map((finding, index) => `${index + 1}. ${finding}`).join('\n')}`, kind: 'finding' as const, createdAt: new Date().toISOString() };
            run.messages.push(request); await this.emit(run.id, 'agent.message', request);
            // Mirrors the resume filter above: App.tsx only stamps revertedAt in its undo, which requires appliedAt, so !appliedAt already excludes every reverted change.
            const reviewedChanges = run.changes?.filter(change => change.itemId === item.id && !change.appliedAt && !change.supersededAt && !change.rejectedAt) ?? [];
            if (reviewedChanges.length) {
              const supersededAt = new Date().toISOString();
              for (const change of reviewedChanges) change.supersededAt = supersededAt;
              run.updatedAt = supersededAt;
              await this.emit(run.id, 'run.status', { status: run.status, supersededChangeIds: reviewedChanges.map(change => change.id) });
            }
            const reviewedArtifacts = run.artifacts.filter(artifact => artifact.workItemId === item.id && !artifact.supersededAt);
            if (reviewedArtifacts.length) {
              const supersededAt = new Date().toISOString();
              for (const artifact of reviewedArtifacts) artifact.supersededAt = supersededAt;
              run.updatedAt = supersededAt;
              await this.emit(run.id, 'run.status', { status: run.status, supersededArtifactIds: reviewedArtifacts.map(artifact => artifact.id) });
            }
            throwIfAborted(signal);
            const revised = await this.executor.execute({ runId: run.id, brief: run.brief, step: item, team, priorMessages: run.messages, feedback, attempt: attempt + 1, signal });
            for (const message of revised.messages ?? []) {
              const entry = { id: `msg-${run.messages.length + 1}`, runId: run.id, workItemId: item.id, attempt: attempt + 1, from: agent.name, ...message, createdAt: new Date().toISOString() };
              run.messages.push(entry); await this.emit(run.id, 'agent.message', entry);
            }
            for (const artifact of revised.artifacts ?? []) { const linked = { ...artifact, workItemId: item.id, attempt: attempt + 1 }; run.artifacts.push(linked); item.artifactIds.push(linked.id); await this.emit(run.id, 'artifact.created', linked); }
            for (const change of revised.changes ?? []) {
              run.changes ??= [];
              const proposal: CodeChange = { ...change, id: `change-${run.changes.length + 1}`, itemId: item.id, createdBy: agent.name, attempt: attempt + 1 };
              run.changes.push(proposal); await this.emit(run.id, 'code-change.proposed', proposal);
            }
            attempt += 1;
            revisions += 1;
            verdict = await this.reviewer.review({ run, item, signal });
            throwIfAborted(signal);
          }
          for (const finding of verdict.findings) await this.emit(run.id, 'review.finding', { itemId: item.id, finding, attempt });
          if (!verdict.passed) {
            item.status = 'needs-approval'; needsApproval = true;
            await this.emit(run.id, 'work.finished', { item });
            await this.emit(run.id, 'approval.required', { itemId: item.id, reason: verdict.findings.join('\n') });
          } else { item.status = 'done'; await this.emit(run.id, 'work.finished', { item }); }
        }
        if (failed) throw failed.reason;
        if (needsApproval) { run.status = 'needs-approval'; run.updatedAt = new Date().toISOString(); await this.emit(run.id, 'run.status', { status: run.status }); await this.approval.request(run, 'Automatic review found issues requiring human review.'); return run; }
        for (const item of run.items.filter(candidate => candidate.status === 'blocked')) if (item.dependsOn.every(id => run.items.find(candidate => candidate.id === id)?.status === 'done')) { item.status = 'ready'; await this.emit(run.id, 'work.ready', { item }); }
        const hasMoreWork = run.items.some(item => item.status === 'ready' || item.status === 'blocked');
        if (run.checkpointPolicy === 'each-wave' && hasMoreWork) {
          run.status = 'needs-approval'; run.checkpointPaused = true; run.updatedAt = new Date().toISOString();
          const message: Run['messages'][number] = { id: `msg-${run.messages.length + 1}`, runId: run.id, from: 'Dispatch', to: 'team', text: 'Checkpoint reached. The completed wave is saved. Review its handoffs, findings, and staged work before approving the next wave.', kind: 'update', createdAt: run.updatedAt };
          run.messages.push(message); await this.emit(run.id, 'agent.message', message);
          await this.emit(run.id, 'run.status', { status: run.status, checkpointPaused: true }); await this.approval.request(run, 'A workflow checkpoint is waiting for approval.'); return run;
        }
      }
      throwIfAborted(signal);
      run.status = 'completed';
    } catch (error) {
      // A device that cannot save is not a run that failed. Bookkeeping failures are rethrown
      // with the run state left as it was, so a finished run is never rewritten as failed by
      // a storage hiccup. Work failures still fail the run, as before.
      if (error instanceof RunStoreError) throw error;
      const cancelled = signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
      run.status = cancelled ? 'cancelled' : 'failed';
      const detail = cancelled ? 'Run cancelled by you.' : error instanceof Error ? error.message : String(error);
      for (const item of run.items.filter(candidate => ['running', 'ready', 'blocked'].includes(candidate.status))) { item.status = cancelled ? 'cancelled' : 'failed'; await this.emit(run.id, 'work.finished', { item }); }
      run.messages.push({ id: `msg-${run.messages.length + 1}`, runId: run.id, from: 'Dispatch', to: 'team', text: cancelled ? 'Run cancelled. Completed work and review messages remain available in this run.' : `Run stopped: ${detail}`, kind: cancelled ? 'update' : 'finding', createdAt: new Date().toISOString() });
      await this.emit(run.id, 'agent.message', run.messages[run.messages.length - 1]);
      await this.emit(run.id, 'run.status', { status: run.status, error: detail });
    }
    run.updatedAt = new Date().toISOString(); await this.emit(run.id, 'run.status', { status: run.status }); return run;
  }

  private async emit(runId: string, type: RunEvent['type'], payload: unknown) {
    try { await this.store.append({ runId, type, payload, at: new Date().toISOString() }); }
    catch (error) { throw new RunStoreError(error); }
  }
}

/** A device-storage failure while recording run events. Distinct from a work failure: the run's work may be fine. */
export class RunStoreError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) { super(cause instanceof Error ? cause.message : String(cause)); this.name = 'RunStoreError'; this.cause = cause; }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) { const error = new Error('The operation was aborted.'); error.name = 'AbortError'; throw error; }
}

function supports(agent: Agent, item: WorkItem) { return agent.kinds.includes(item.kind); }

function nextAttempt(run: Run, item: WorkItem): number {
  const messageAttempts = run.messages.filter(message => message.workItemId === item.id).map(message => message.attempt ?? 1);
  const changeAttempts = run.changes?.filter(change => change.itemId === item.id).map(change => change.attempt) ?? [];
  const artifactAttempts = run.artifacts.filter(artifact => artifact.workItemId === item.id).map(artifact => artifact.attempt ?? 1);
  return Math.max(0, ...messageAttempts, ...changeAttempts, ...artifactAttempts) + 1;
}

function reviewFeedback(run: Run, item: WorkItem): string[] {
  return run.messages.filter(message => message.workItemId === item.id && message.kind === 'finding' && /review/i.test(message.from)).slice(-8).map(message => message.text.slice(0, 1400));
}
