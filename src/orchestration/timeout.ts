/**
 * A bounded deadline for every provider request.
 *
 * The provider layer takes an `AbortSignal`, so the orchestration layer owns the deadline: each
 * planner, builder and reviewer call runs under a signal that fires after a fixed budget, and the
 * user's own cancel signal is forwarded into it so cancel still works. A hung endpoint now ends
 * as a stated timeout instead of a run that never finishes.
 */

/** Default budget for one provider request. */
export const REQUEST_TIMEOUT_MS = 120_000;

/** A provider request that ran past its deadline. */
export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`The model request timed out after ${Math.max(1, Math.round(timeoutMs / 1000))} seconds.`);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export type RequestDeadline = {
  /** The composed signal to hand to the provider. */
  signal: AbortSignal;
  /** True when the deadline, not the user, ended the request. */
  timedOut: () => boolean;
  /** Releases the timer and the listener on the user's signal. */
  dispose: () => void;
};

/** Composes the user's cancel signal with a deadline into one signal. */
export function withRequestTimeout(userSignal?: AbortSignal, timeoutMs: number = REQUEST_TIMEOUT_MS): RequestDeadline {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => { if (!controller.signal.aborted) controller.abort(); };
  if (userSignal?.aborted) abort();
  else userSignal?.addEventListener('abort', abort);
  const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => { clearTimeout(timer); userSignal?.removeEventListener('abort', abort); },
  };
}

/**
 * Runs `call` under a deadline.
 *
 * The deadline is raced against the call, not just signalled to it: an endpoint that ignores the
 * abort signal must not be able to hang the run. A deadline that fires raises
 * `RequestTimeoutError`; the user's cancel keeps raising the provider's own abort error, so
 * cancel and timeout stay distinct.
 */
export async function withDeadline<T>(userSignal: AbortSignal | undefined, timeoutMs: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const deadline = withRequestTimeout(userSignal, timeoutMs);
  const pending = call(deadline.signal);
  pending.catch(() => undefined); // a late rejection is already lost to the race; this keeps it from going unhandled
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RequestTimeoutError(timeoutMs)), timeoutMs); });
  try {
    return await Promise.race([pending, expiry]);
  } catch (error) {
    if (deadline.timedOut()) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    deadline.dispose();
  }
}
