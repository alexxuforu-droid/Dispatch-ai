import React, { useRef } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { Run, WorkItem } from '../../../orchestration/types';
import { KeyEventLike, hasShift, isEnterEvent, keyHandlerProps } from '../../../Reveal';
import { Button } from '../../../ui';
import { RunConversation } from './RunConversation';
import { styles } from '../styles';

const DispatchHomeImpl = React.memo(function DispatchHome({ draft, setDraft, onStart, onApprovePlan, onEditPlanTitle, onEditPlanItems, onOpenResults, onBrowseFiles, canStart, run, runBusy, pendingBrief, onOpenRunSetup }: { draft: string; setDraft: (text: string) => void; onStart: () => void; onApprovePlan: () => void; onEditPlanTitle: (itemId: string, title: string) => void; onEditPlanItems?: (items: WorkItem[]) => void; onOpenResults: () => void; onBrowseFiles: () => void; canStart: boolean; run: Run | null; runBusy: boolean; pendingBrief: string; onOpenRunSetup?: () => void }) {
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
      </View>
      </> : <RunConversation key={run?.id ?? pendingBrief} run={run} pendingBrief={pendingBrief} busy={runBusy} onOpenResults={onOpenResults} onApprovePlan={onApprovePlan} onEditPlanTitle={onEditPlanTitle} onEditPlanItems={onEditPlanItems} />}
    </ScrollView>
    <View style={styles.composerArea}>
      <View style={styles.composer}>
        <TextInput {...keyHandlerProps<React.ComponentProps<typeof TextInput>>(keyDown)} accessibilityLabel="Describe a task for your agent team" accessibilityHint="Press Enter to start the run, or Shift plus Enter for a line break." multiline value={draft} onChangeText={changeDraft} placeholder="Describe the work" placeholderTextColor={colors.textMuted} style={styles.composerInput} textAlignVertical="top" maxLength={12000} />
        <View style={[styles.composerActions, onOpenRunSetup && styles.composerActionsCompact]}>
          <View style={styles.composerTools}>
            <Button label="Project files" variant="ghost" accessibilityLabel="Browse project files" onPress={onBrowseFiles} icon={<DispatchIcon name="plus" size={16} color={colors.textQuiet} />} />
            {onOpenRunSetup ? <Button label="Run setup" variant="ghost" accessibilityHint="Choose the agent team and review policy for this run." onPress={onOpenRunSetup} icon={<DispatchIcon name="settings" size={16} color={colors.textQuiet} />} /> : null}
          </View>
          <View style={[styles.composerRight, onOpenRunSetup && styles.composerRightCompact]}>
            <Button label={runBusy ? 'Working…' : 'Start run'} variant="primary" onPress={onStart} disabled={!canStart} icon={<DispatchIcon name="send" size={16} color={colors.buttonPrimaryInk} />} accessibilityLabel="Start coordinated run" />
          </View>
        </View>
      </View>
      
    </View>
  </View>;
});

export { DispatchHomeImpl as DispatchHome };
