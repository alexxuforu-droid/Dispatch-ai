import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FocusPressable } from '../../../Reveal';
import { Toggle } from '../../../ui';
import { WorkspaceSettings } from './WorkspaceSettings';
import { ProviderSettings } from './ProviderSettings';
import { SettingsRow } from './SettingsRow';
import { styles } from '../styles';

const SettingsHomeImpl = React.memo(function SettingsHome({ reviewCode, setReviewCode, reviewImages, setReviewImages, planningDebate, setPlanningDebate, checkpointPolicy, setCheckpointPolicy, peerApprovalEnabled, setPeerApprovalEnabled, requirePlanApproval, setRequirePlanApproval, maxConcurrency, setMaxConcurrency, onProviderReady, onProviderRemoved, onAddFileContext, onProjectRootChange }: { reviewCode: boolean; setReviewCode: (value: boolean) => void; reviewImages: boolean; setReviewImages: (value: boolean) => void; planningDebate: boolean; setPlanningDebate: (value: boolean) => void; checkpointPolicy: 'plan-only' | 'each-wave'; setCheckpointPolicy: (value: 'plan-only' | 'each-wave') => void; peerApprovalEnabled: boolean; setPeerApprovalEnabled: (value: boolean) => void; requirePlanApproval: boolean; setRequirePlanApproval: (value: boolean) => void; maxConcurrency: number; setMaxConcurrency: (value: number) => void; onProviderReady: () => void; onProviderRemoved: () => void; onAddFileContext: (path: string, content: string) => void; onProjectRootChange: (path: string) => void }) {
  return <ScrollView contentContainerStyle={styles.settingsPage}>
    
    <ProviderSettings onReady={onProviderReady} onRemoved={onProviderRemoved} />
    <WorkspaceSettings onAddFileContext={onAddFileContext} onProjectRootChange={onProjectRootChange} />
    <SettingsRow title="Agent permissions" status="TEAMS" />
    <SettingsRow title="Workspace data" status="LOCAL" />
    <View style={styles.settingsReview}><Text style={styles.settingsSectionTitle}>Review policy</Text>
      <Toggle label="Code proposals" value={reviewCode} onChange={setReviewCode} />
      <Toggle label="Automatic image review" value={reviewImages} onChange={setReviewImages} />
      <Toggle label="Approve plans before they run" value={requirePlanApproval} onChange={setRequirePlanApproval} />
      <Toggle label="Senior agent auto-approval" value={peerApprovalEnabled} onChange={setPeerApprovalEnabled} />
      <Toggle label="Debate the plan" value={planningDebate} onChange={setPlanningDebate} />
      <Text style={[styles.settingsSectionTitle, styles.settingsSectionTitleSpaced]}>Run checkpoints</Text>
      <View style={styles.checkpointOptions}><FocusPressable accessibilityRole="radio" accessibilityState={{ checked: checkpointPolicy === 'plan-only' }} onPress={() => setCheckpointPolicy('plan-only')} style={[styles.teamChip, checkpointPolicy === 'plan-only' && styles.teamChipActive]}><Text style={[styles.teamChipText, checkpointPolicy === 'plan-only' && styles.teamChipTextActive]}>Plan approval only</Text></FocusPressable><FocusPressable accessibilityRole="radio" accessibilityState={{ checked: checkpointPolicy === 'each-wave' }} onPress={() => setCheckpointPolicy('each-wave')} style={[styles.teamChip, checkpointPolicy === 'each-wave' && styles.teamChipActive]}><Text style={[styles.teamChipText, checkpointPolicy === 'each-wave' && styles.teamChipTextActive]}>Pause after each wave</Text></FocusPressable></View>
      <Text style={styles.settingsSectionTitle}>Wave concurrency cap</Text>
      <View style={styles.checkpointOptions}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(cap => <FocusPressable key={cap} accessibilityRole="radio" accessibilityState={{ checked: maxConcurrency === cap }} onPress={() => setMaxConcurrency(cap)} style={[styles.teamChip, maxConcurrency === cap && styles.teamChipActive]}><Text style={[styles.teamChipText, maxConcurrency === cap && styles.teamChipTextActive]}>{cap === 0 ? 'Unlimited' : cap}</Text></FocusPressable>)}</View>
    </View>
  </ScrollView>;
});

export { SettingsHomeImpl as SettingsHome };
