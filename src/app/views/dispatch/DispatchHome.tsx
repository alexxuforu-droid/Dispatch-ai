import React, { useRef } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { Run, WorkItem } from '../../../orchestration/types';
import { FocusPressable, KeyEventLike, hasShift, isEnterEvent, keyHandlerProps } from '../../../Reveal';
import { Button } from '../../../ui';
import { missionPresets } from '../../../missions';
import { RunConversation } from './RunConversation';
import { styles } from '../styles';

const DispatchHomeImpl = React.memo(function DispatchHome({ draft, setDraft, onSelectMission, selectedMission, onStart, onApprovePlan, onEditPlanTitle, onEditPlanItems, onOpenResults, onBrowseFiles, canStart, run, runBusy, pendingBrief, providerReady, onOpenRunSetup }: { draft: string; setDraft: (text: string) => void; onSelectMission: (preset: typeof missionPresets[number])=>void; selectedMission?:string; onStart: () => void; onApprovePlan: () => void; onEditPlanTitle: (itemId: string, title: string) => void; onEditPlanItems?: (items: WorkItem[]) => void; onOpenResults: () => void; onBrowseFiles: () => void; canStart: boolean; run: Run | null; runBusy: boolean; pendingBrief: string; providerReady: boolean; onOpenRunSetup?: () => void }) {
  // Enter starts the run. The field still inserts the newline the key produces, so the one
  // line it adds is taken back out before the draft is stored.
  const stripNextNewline = useRef(false);
  const changeDraft = (text: string) => {
    if (!stripNextNewline.current) { setDraft(text); return; }
    stripNextNewline.current = false;
    setDraft(text.replace(/\n$/, ''));
  };
  const keyDown = (event: KeyEventLike) => {
    if (!isEnterEvent(event) || hasShift(event) || !canStart) return;
    stripNextNewline.current = true;
    onStart();
  };
  return <View style={styles.dispatchPage}>
    <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
      {!run && !pendingBrief ? <><View style={styles.chatHero}>
        <Text style={styles.heroTitle}>What should we{'\n'}work on?</Text>
        <Text style={styles.heroBody}>Give Dispatch the outcome. Agents plan and hand off work as a team. Code proposals get an independent review, and generated images get a visual review when your models support it.</Text>
      </View>
      <View style={styles.promptSection}><Text style={styles.promptHeading}>Mission presets</Text><View style={styles.promptRows}>{missionPresets.map(preset=><FocusPressable key={preset.mission.id} accessibilityRole="button" accessibilityLabel={`${preset.mission.name}. ${preset.outcome}`} onPress={()=>onSelectMission(preset)} style={[styles.promptCard, selectedMission===preset.mission.id&&styles.promptCardActive]}><Text style={styles.promptCardTitle}>{preset.mission.name}</Text><Text style={styles.promptCardDetail}>{preset.outcome}</Text><Text style={styles.promptCardMeta}>{preset.eyebrow} · {preset.review}</Text></FocusPressable>)}</View></View>
      </> : <RunConversation key={run?.id ?? pendingBrief} run={run} pendingBrief={pendingBrief} busy={runBusy} onOpenResults={onOpenResults} onApprovePlan={onApprovePlan} onEditPlanTitle={onEditPlanTitle} onEditPlanItems={onEditPlanItems} />}
    </ScrollView>
    <View style={styles.composerArea}>
      <View style={styles.composer}>
        <TextInput {...keyHandlerProps<React.ComponentProps<typeof TextInput>>(keyDown)} accessibilityLabel="Describe a task for your agent team" accessibilityHint="Press Enter to start the run, or Shift plus Enter for a line break." multiline value={draft} onChangeText={changeDraft} placeholder="Describe the work. Dispatch will coordinate the team…" placeholderTextColor={colors.textMuted} style={styles.composerInput} textAlignVertical="top" maxLength={12000} />
        <View style={[styles.composerActions, onOpenRunSetup && styles.composerActionsCompact]}>
          <View style={styles.composerTools}>
            <FocusPressable style={styles.attachButton} accessibilityRole="button" accessibilityLabel="Browse project files" onPress={onBrowseFiles}><DispatchIcon name="plus" size={16} color={colors.textQuiet} /><Text style={styles.attachLabel}>Project files</Text></FocusPressable>
            {onOpenRunSetup ? <FocusPressable accessibilityRole="button" accessibilityLabel="Run setup" accessibilityHint="Choose the agent team and the review policy for this run." onPress={onOpenRunSetup} style={({ pressed }) => [styles.attachButton, styles.runSetupButton, pressed && styles.pressed]}><DispatchIcon name="settings" size={16} color={colors.textQuiet} /><Text style={styles.attachLabel}>Run setup</Text></FocusPressable> : null}
          </View>
          <View style={[styles.composerRight, onOpenRunSetup && styles.composerRightCompact]}><Text style={[styles.returnHint, onOpenRunSetup && styles.returnHintCompact]}>Enter to run, Shift + Enter for a line break</Text>
            <Button label={runBusy ? 'Working…' : 'Start run'} onPress={onStart} disabled={!canStart} icon={<DispatchIcon name="send" size={16} color={canStart ? colors.page : colors.textMuted} />} accessibilityLabel="Start coordinated run" />
          </View>
        </View>
      </View>
      <Text style={styles.composerFoot}>{runBusy ? (run?.status === 'queued' ? 'Dispatch is preparing the plan for your review.' : 'Agents are working through the plan. Their handoffs appear above.') : run?.status === 'queued' ? 'The plan is saved. Review it above and approve when you are ready.' : providerReady ? 'Choose the outcome, then start a run with your selected team.' : 'Connect a provider in Settings to start a coordinated run.'}</Text>
    </View>
  </View>;
});

export { DispatchHomeImpl as DispatchHome };
