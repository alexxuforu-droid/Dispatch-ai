import { PluginFlags } from '../../orchestration/plugins';
import { Run, RunPolicy } from '../../orchestration/types';

/**
 * The live switches a run would execute under if it had no snapshot of its own.
 *
 * Same five fields as the snapshot: the switches that decide whether a run reviews code, reviews
 * images, lets a peer agent approve its own writes, runs waves in parallel, or has the project
 * and media capabilities switched on.
 */
export type LiveRunPolicy = {
  peerApprovalEnabled: boolean;
  plugins: PluginFlags;
  reviewCode: boolean;
  reviewImages: boolean;
  maxConcurrency: number;
};

/** Freezes the live switches onto a run, so a later toggle cannot change this run. */
export function snapshotRunPolicy(live: LiveRunPolicy): RunPolicy {
  return {
    peerApprovalEnabled: live.peerApprovalEnabled,
    plugins: { ...live.plugins },
    reviewCode: live.reviewCode,
    reviewImages: live.reviewImages,
    maxConcurrency: live.maxConcurrency,
  };
}

/**
 * The policy a run executes under.
 *
 * A run created after the snapshot existed carries its own, and that is what it executes under:
 * the toggles in Settings describe the NEXT run, not this one. A run saved before the snapshot
 * existed has no `policy` field, so it falls back to the live settings, which is the only
 * behaviour it ever had.
 */
export function effectiveRunPolicy(run: Run, live: LiveRunPolicy): RunPolicy {
  return run.policy ?? snapshotRunPolicy(live);
}
