import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { clearUsage, formatTokenCount, readUsage, readUsageResult, readUsageSummary, rollUpUsage, UsageRecord, UsageSummary } from '../../../persistence/usageLedger';
import { Button, CopyButton, EmptyState, Skeleton, SkeletonGate } from '../../../ui';
import { NoticeReporter } from '../../controllers/types';
import { ConfirmDialog } from '../ConfirmDialog';
import { styles } from '../styles';

const EMPTY_SUMMARY: UsageSummary = { exact: 0, estimated: 0, callCount: 0, rows: 0, oldestAt: 0, newestAt: 0 };

const UsageHomeImpl = React.memo(function UsageHome({ onNotice }: { onNotice: NoticeReporter }) {
  const [records, setRecords] = useState<UsageRecord[] | null>(null);
  // The totals of the rows the retention window has already folded away. They are the history
  // the ledger no longer holds, so they are shown next to the rows that are still here.
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureReason, setFailureReason] = useState('');
  const [discardFailed, setDiscardFailed] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([readUsageResult(), readUsageSummary()]).then(([result, retained]) => {
      if (!live) return;
      setSummary(retained);
      if (result.status === 'corrupt') {
        setFailed(true);
        setFailureReason(`${result.reason}. A copy of the unreadable file was kept as ${result.quarantineKey}.`);
        setRecords([]);
        return;
      }
      setRecords(result.value);
    }).catch(() => { if (live) { setFailed(true); setFailureReason('The local usage ledger could not be read from this device.'); setRecords([]); } });
    return () => { live = false; };
  }, []);
  const totals = rollUpUsage(records ?? []);
  const recent = [...(records ?? [])].sort((left, right) => right.at - left.at).slice(0, 40);
  // Recovery for an unreadable ledger. Without this the failed state is a dead end: the
  // screen can report the problem but never clear the thing causing it.
  const discardUsageHistory = async () => {
    setDiscardOpen(false);
    // clearUsage swallows its own failure, so the promise tells us nothing either way. The
    // store is re-read afterwards and only a confirmed zero counts as success.
    await clearUsage();
    const remaining = await readUsage().then(rows => rows.length).catch(() => -1);
    if (remaining !== 0) { setDiscardFailed(true); onNotice('The local usage history could not be confirmed as cleared. It may be partly removed.', 'critical'); return; }
    setDiscardFailed(false);
    setRecords([]);
    setSummary(EMPTY_SUMMARY);
    setFailed(false);
    onNotice('Local usage history discarded.', 'success');
  };
  const byModel = [...new Set((records ?? []).map(row => row.model))].sort();
  const when = (at: number) => {
    const date = new Date(at);
    // A finite timestamp can still sit outside the Date range; NaN-NaN-NaN is worse than saying so.
    if (Number.isNaN(date.getTime())) return 'time unavailable';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // Two separate aggregates, never a grand total. The figures are deliberately not
  // combined anywhere: a summed number would imply a precision no component supports.
  const totalCard = (label: string, value: number, basis: 'exact' | 'estimated', note: string) =>
    <View style={styles.usageTotalCard} accessibilityLabel={`${label} ${formatTokenCount(value, basis)}. ${note}`}>
      <Text style={styles.usageTotalLabel}>{label}</Text>
      <Text style={[styles.usageTotalValue, basis === 'estimated' && styles.usageValueEstimated]}>{formatTokenCount(value, basis)}</Text>
      <Text style={styles.usageTotalNote}>{note}</Text>
    </View>;

  const failureSentence = discardFailed
    ? 'The local usage history could not be confirmed as cleared. It may be partly removed; try again or leave it alone.'
    : `The local usage ledger did not load. Nothing is lost until you discard it.${failureReason ? ` ${failureReason}` : ''}`;

  return <ScrollView contentContainerStyle={styles.settingsPage}>


    
    {failed
      ? <EmptyState title="Usage history could not be read" sentence={failureSentence} action={<Button label="Discard local usage history" accessibilityLabel="Discard local usage history" onPress={() => { void discardUsageHistory(); }} variant="critical" />} />
      : records === null
        ? <SkeletonGate active><View testID="usage-loading-skeleton">
            <View style={styles.usageTotals}>{[0, 1].map(card => <View key={card} style={styles.usageTotalCard}>
              <Skeleton style={styles.usageSkeletonLabel} />
              <Skeleton style={styles.usageSkeletonValue} />
              <Skeleton style={styles.usageSkeletonNote} />
            </View>)}</View>
            <View style={styles.usageList}>{[0, 1, 2, 3].map(row => <View key={row} style={styles.usageRow}>
              <View style={styles.usageRowMain}><Skeleton style={styles.usageSkeletonRowTitle} /><Skeleton style={styles.usageSkeletonRowDetail} /></View>
              <Skeleton style={styles.usageSkeletonRowValue} />
            </View>)}</View>
          </View></SkeletonGate>
        : <>
            <View style={styles.usageTotals}>
              {totalCard('Exact total', totals.exact, 'exact', 'Reported by the provider')}
              {totalCard('Estimated total', totals.estimated, 'estimated', 'Length-based, not reported')}
            </View>
            <CopyButton
              text={[
                `Exact total: ${formatTokenCount(totals.exact, 'exact')}`,
                `Estimated total: ${formatTokenCount(totals.estimated, 'estimated')}`,
                `Provider calls: ${totals.callCount}`,
                `Models: ${byModel.length}`,
              ].join('\n')}
              label="Copy totals"
              subject="the usage totals"
            />
            <Text style={styles.usageFootnote}>{totals.callCount} provider {totals.callCount === 1 ? 'call' : 'calls'} recorded across {byModel.length} {byModel.length === 1 ? 'model' : 'models'}. Image generation calls are not counted because image endpoints report no token usage.</Text>
            {summary && summary.rows > 0 ? <Text style={styles.usageFootnote}>Retained history: {summary.rows} older {summary.rows === 1 ? 'call' : 'calls'} kept in the totals, {formatTokenCount(summary.exact, 'exact')} exact and {formatTokenCount(summary.estimated, 'estimated')} estimated.</Text> : null}
            {recent.length
              ? <>
                  <Text style={styles.promptHeading}>Recent calls</Text>
                  <View style={styles.usageList}>{recent.map((row, index) => <View key={`${row.at}-${index}`} style={styles.usageRow}>
                    <View style={styles.usageRowMain}>
                      <Text style={styles.usageRowModel} accessibilityLabel={`Model ${row.model}`}>{row.model}</Text>
                      <Text style={styles.usageRowMeta}>{row.agentId}{row.phase === 'plan' ? ' · planning' : row.runId ? ` · ${row.runId}` : ''} · {when(row.at)}</Text>
                    </View>
                    <Text style={[styles.usageRowValue, row.basis === 'estimated' && styles.usageValueEstimated]} accessibilityLabel={`${row.basis === 'exact' ? 'Exact' : 'Estimated'} ${formatTokenCount(row.totalTokens, row.basis)}`}>{formatTokenCount(row.totalTokens, row.basis)}</Text>
                  </View>)}</View>
                </>
              : <EmptyState title="No provider calls recorded yet" />}
            <Button label="Discard local usage history" accessibilityLabel="Discard local usage history" onPress={() => setDiscardOpen(true)} variant="ghost" />
          </>}
    <ConfirmDialog
      visible={discardOpen}
      title="Discard the local usage history?"
      confirmLabel="Discard usage history"
      onConfirm={() => { void discardUsageHistory(); }}
      onCancel={() => setDiscardOpen(false)}
    />
  </ScrollView>;
});

export { UsageHomeImpl as UsageHome };
