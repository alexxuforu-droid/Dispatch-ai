import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FocusPressable } from '../../../Reveal';
import { Toggle } from '../../../ui';
import { WorkspaceSettings } from './WorkspaceSettings';
import { ProviderSettings } from './ProviderSettings';
import { SettingsRow } from './SettingsRow';
import { styles } from '../styles';

const SettingsHomeImpl = React.memo(function SettingsHome({ reviewCode, setReviewCode, reviewImages, setReviewImages, planningDebate, setPlanningDebate, checkpointPolicy, setCheckpointPolicy, peerApprovalEnabled, setPeerApprovalEnabled, maxConcurrency, setMaxConcurrency, onProviderReady, onProviderRemoved, onAddFileContext, onProjectRootChange }: { reviewCode: boolean; setReviewCode: (value: boolean) => void; reviewImages: boolean; setReviewImages: (value: boolean) => void; planningDebate: boolean; setPlanningDebate: (value: boolean) => void; checkpointPolicy: 'plan-only' | 'each-wave'; setCheckpointPolicy: (value: 'plan-only' | 'each-wave') => void; peerApprovalEnabled: boolean; setPeerApprovalEnabled: (value: boolean) => void; maxConcurrency: number; setMaxConcurrency: (value: number) => void; onProviderReady: () => void; onProviderRemoved: () => void; onAddFileContext: (path: string, content: string) => void; onProjectRootChange: (path: string) => void }) {
  return <ScrollView contentContainerStyle={styles.settingsPage}>
    <Text style={styles.collectionBody}>Provider connections, project access, and automatic review policy for this local workspace.</Text>
    <ProviderSettings onReady={onProviderReady} onRemoved={onProviderRemoved} />
    <WorkspaceSettings onAddFileContext={onAddFileContext} onProjectRootChange={onProjectRootChange} />
    <SettingsRow title="Agent permissions" body="Every agent starts with project tools disabled. Set team membership, rank, and tool access under Teams → Hierarchy." status="TEAMS" />
    <SettingsRow title="Workspace data" body="Teams, run plans, agent handoffs, and review outcomes stay on this device. Provider secrets are stored separately in Windows Credential Manager." status="LOCAL" />
    <View style={styles.settingsReview}><Text style={styles.settingsSectionTitle}>Review policy</Text><Text style={styles.settingsSectionBody}>Code proposals are checked by a separate model pass. Generated images are inspected with the configured chat model when it accepts image input; unsupported reviews stay human-gated.</Text>
      <Toggle label="Code proposals" detail="An independent model reviews generated code. With it off, proposals stay staged for you." value={reviewCode} onChange={setReviewCode} />
      <Toggle label="Automatic image review" detail="The configured model inspects generated image pixels. Uncertain results are held for you." value={reviewImages} onChange={setReviewImages} />
      <Toggle label="Senior agent auto-approval" detail="Let a qualified higher-ranked reviewer apply passed code changes, which writes to your project. Otherwise you apply them yourself." value={peerApprovalEnabled} onChange={setPeerApprovalEnabled} />
      <Toggle label="Debate the plan" detail="Up to three specialists critique the planner’s first draft before it is shown to you" value={planningDebate} onChange={setPlanningDebate} />
      <Text style={[styles.settingsSectionTitle, styles.settingsSectionTitleSpaced]}>Run checkpoints</Text><Text style={styles.settingsSectionBody}>Every run pauses for your plan approval. Choose whether to also pause between dependency waves.</Text>
      <View style={styles.checkpointOptions}><FocusPressable accessibilityRole="radio" accessibilityState={{ checked: checkpointPolicy === 'plan-only' }} onPress={() => setCheckpointPolicy('plan-only')} style={[styles.teamChip, checkpointPolicy === 'plan-only' && styles.teamChipActive]}><Text style={[styles.teamChipText, checkpointPolicy === 'plan-only' && styles.teamChipTextActive]}>Plan approval only</Text></FocusPressable><FocusPressable accessibilityRole="radio" accessibilityState={{ checked: checkpointPolicy === 'each-wave' }} onPress={() => setCheckpointPolicy('each-wave')} style={[styles.teamChip, checkpointPolicy === 'each-wave' && styles.teamChipActive]}><Text style={[styles.teamChipText, checkpointPolicy === 'each-wave' && styles.teamChipTextActive]}>Pause after each wave</Text></FocusPressable></View>
      <Text style={styles.settingsSectionTitle}>Wave concurrency cap</Text><Text style={styles.settingsSectionBody}>How many ready agents may run at once in each wave. Unlimited starts every ready item together; a cap splits each wave into sequential slices and may slow runs.</Text>
      <View style={styles.checkpointOptions}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(cap => <FocusPressable key={cap} accessibilityRole="radio" accessibilityState={{ checked: maxConcurrency === cap }} onPress={() => setMaxConcurrency(cap)} style={[styles.teamChip, maxConcurrency === cap && styles.teamChipActive]}><Text style={[styles.teamChipText, maxConcurrency === cap && styles.teamChipTextActive]}>{cap === 0 ? 'Unlimited' : cap}</Text></FocusPressable>)}</View>
    </View>
  </ScrollView>;
});

export { SettingsHomeImpl as SettingsHome };
