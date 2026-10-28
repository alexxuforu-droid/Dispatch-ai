import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { codeApplySecretBlock } from '../../../orchestration/review';
import { diffLines } from '../../../orchestration/diffLines';
import { CodeChange, WorkItem } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { styles } from '../styles';

const CodeProposalCardImpl = React.memo(function CodeProposalCard({ change, itemStatus, projectRoot, applying, onApply }: { change: CodeChange; itemStatus: WorkItem['status'] | undefined; projectRoot: string; applying: boolean; onApply: () => void }) {
  // The capped line diff is the default view; the full before/after is one action away, so a
  // 400-line proposal still answers "which lines moved" without burying them.
  const [complete, setComplete] = useState(false);
  const diff = diffLines(change.before, change.after);
  const isNewFile = change.createOnly || !change.before;
  const summary = isNewFile ? `NEW FILE · +${diff.added}` : diff.identical ? 'No changes' : `DIFF · +${diff.added} -${diff.removed}`;
  const secretBlock = codeApplySecretBlock(change);
  const canApply = !!projectRoot && ['done', 'needs-approval'].includes(itemStatus ?? '') && !change.appliedAt && !change.supersededAt && !change.rejectedAt && !change.revertedAt && !secretBlock;
  // One label, used for both the visible text and the accessible name, so the name a screen
  // reader announces always contains the words on screen (WCAG 2.5.3). The path is appended
  // because several proposals can sit on one screen.
  const applyLabel = applying ? 'Applying…'
    : !projectRoot ? 'Choose a project folder first'
    : itemStatus === 'needs-approval' ? 'Review findings and apply anyway'
    : itemStatus === 'done' ? 'Apply proposal'
    : itemStatus === 'cancelled' ? 'Run was cancelled'
    : itemStatus === 'blocked' ? 'Waiting for its dependencies'
    : itemStatus === 'failed' ? 'This step failed'
    : 'Waiting for review';
  return <View style={styles.codeProposal}>
    <View style={styles.codeProposalHead}><View style={styles.flexOne}><Text style={styles.codeProposalPath}>{change.path}</Text><Text style={styles.codeProposalMeta}>{change.createdBy} · revision {change.attempt} · {change.supersededAt ? 'replaced by a newer proposal' : itemStatus === 'done' ? 'work complete · inspect before applying' : itemStatus === 'needs-approval' ? 'automatic review flagged this proposal' : itemStatus ?? 'waiting'}</Text></View><Text style={styles.imageArtifactTag}>{change.supersededAt ? 'Superseded' : change.revertedAt ? 'Reverted' : change.rejectedAt ? 'Rejected' : change.appliedAt ? 'Applied' : 'Proposal'}</Text></View>
    {change.before ? null : <Text style={styles.codeProposalMeta}>New file · the project will be checked again before creation.</Text>}
    <View style={[styles.codeProposalFoot, styles.codeProposalFootWrap]}><Text style={[styles.codeProposalLabel, styles.codeProposalLabelShrink]}>{summary}</Text><FocusPressable accessibilityRole="button" accessibilityState={{ expanded: complete }} accessibilityLabel={complete ? 'Hide complete contents: the file before and after this change' : 'Show complete contents: the file before and after this change'} onPress={() => setComplete(value => !value)} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}><Text style={styles.outlineButtonText}>{complete ? 'Hide complete contents' : 'Show complete contents'}</Text></FocusPressable></View>
    {diff.identical && !isNewFile ? <Text style={styles.codeProposalText}>No changes · contents already match.</Text>
      : diff.lines.length ? <ScrollView horizontal style={styles.codeProposalScroll}><View>{diff.lines.map((line, index) => <View key={index} style={styles.codeProposalDiffRow}><Text style={styles.codeProposalLineNumber}>{line.kind === 'add' ? line.newLineNumber : line.kind === 'remove' ? line.oldLineNumber : line.oldLineNumber}</Text><Text selectable style={[styles.codeProposalText, line.kind === 'add' && styles.codeProposalAdded, line.kind === 'remove' && styles.codeProposalRemoved, line.kind === 'meta' && styles.codeProposalDiffMeta]}>{{ add: '+ ', remove: '- ', context: '  ', meta: '' }[line.kind]}{line.text}</Text></View>)}</View></ScrollView>
        : <Text style={styles.codeProposalText}>Empty file · nothing to preview.</Text>}
    {complete ? <View><Text style={styles.codeProposalLabel}>The file before this change</Text><ScrollView horizontal style={styles.codeProposalScroll}><Text selectable style={styles.codeProposalText}>{change.before || 'This file does not exist yet.'}</Text></ScrollView><Text style={styles.codeProposalLabel}>The file after this change</Text><ScrollView horizontal style={styles.codeProposalScroll}><Text selectable style={styles.codeProposalText}>{change.after}</Text></ScrollView></View> : null}
    {change.revertedAt ? <Text style={styles.codeProposalMeta}>This applied change was reverted and cannot be applied again.</Text> : change.rejectedAt ? <Text style={styles.codeProposalMeta}>This proposal was rejected and cannot be applied.</Text> : change.appliedAt ? <Text style={styles.codeProposalApplied}>{change.approvedBy ? `Approved by ${change.approvedBy}` : change.reviewOverride ? 'Applied after human review of findings' : 'Applied to project'} · {new Date(change.appliedAt).toLocaleString()}</Text> : change.supersededAt ? <Text style={styles.codeProposalMeta}>This proposal has been replaced and cannot be applied.</Text> : secretBlock ? <Text style={styles.codeProposalMeta}>Blocked for secrets · fix first. {secretBlock}</Text> : <FocusPressable accessibilityRole="button" accessibilityLabel={`${applyLabel} · ${change.path}`} disabled={!canApply || applying} onPress={onApply} style={({ pressed }) => [styles.planApproveButton, (!canApply || applying) && styles.planApproveBusy, pressed && canApply && styles.pressed]}><Text style={styles.planApproveText}>{applyLabel}</Text><DispatchIcon name="check" size={15} color={colors.leadInk} /></FocusPressable>}
  </View>;
});

export { CodeProposalCardImpl as CodeProposalCard };
