import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { colors } from '../../../theme';
import { AgentMessage, Run } from '../../../orchestration/types';
import { steerActiveRun } from '../../../orchestration/model-runner';
import { FocusPressable } from '../../../Reveal';
import { Button, EmptyState } from '../../../ui';
import { Role } from '../../types';
import { NoticeReporter } from '../../controllers/types';
import { styles } from '../styles';

/** One line of the conversation, with the run it came from. */
type Entry = { run: Run; message: AgentMessage };

const KIND_LABEL: Record<AgentMessage['kind'], string> = {
  handoff: 'Handoff',
  question: 'Question',
  finding: 'Finding',
  update: 'Update',
};

/**
 * The conversation screen: what the agents said to each other.
 *
 * Every run on the device contributes its messages, oldest first, so the thread reads the way
 * it happened. A live run can be steered from here; when nothing is running, what you write is
 * kept with the run so the agents read it on their next turn, or sent to Dispatch as a task.
 */
const ConversationHomeImpl = React.memo(function ConversationHome({
  runs, roles, current, onUpdate, onSendToDispatch, onNotice,
}: {
  runs: Run[];
  roles: Role[];
  current: Run | null;
  onUpdate: (run: Run) => void;
  onSendToDispatch: (text: string) => void;
  onNotice: NoticeReporter;
}) {
  const [draft, setDraft] = useState('');
  const [speaker, setSpeaker] = useState('everyone');
  const [onlyCurrent, setOnlyCurrent] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    const all = runs.flatMap(run => run.messages.map(message => ({ run, message })));
    return all.sort((left, right) => left.message.createdAt.localeCompare(right.message.createdAt));
  }, [runs]);

  const speakers = useMemo(() => {
    const names = new Set<string>();
    for (const entry of entries) names.add(entry.message.from);
    for (const role of roles) names.add(role.label);
    return [...names].sort();
  }, [entries, roles]);

  const visible = entries.filter(entry => (onlyCurrent ? entry.run.id === current?.id : true)
    && (speaker === 'everyone' || entry.message.from === speaker));

  const send = async () => {
    const text = draft.trim().slice(0, 2000);
    if (!text) return;
    // A live run takes the message straight away: the agents read it on their next step.
    if (current && ['running', 'reviewing'].includes(current.status) && await steerActiveRun(current.id, text)) {
      setDraft('');
      onNotice('Sent to the running team.', 'success');
      return;
    }
    if (current) {
      const createdAt = new Date().toISOString();
      const message: AgentMessage = { id: `local-${current.id}-${current.messages.length + 1}`, runId: current.id, from: 'You', to: 'team', text, kind: 'update', createdAt };
      onUpdate({ ...current, messages: [...current.messages, message], steeringNotes: [...(current.steeringNotes ?? []), text], updatedAt: createdAt });
      setDraft('');
      onNotice('Added to the run. The agents read it on their next step.', 'success');
      return;
    }
    onSendToDispatch(text);
    setDraft('');
  };

  return <View style={styles.chatPage}>
    <View style={styles.chatHead}>
      <Text style={styles.collectionBody}>
        What the agents said to each other, across every run on this device. Write here to steer a running team, or to leave the team a note.
      </Text>
      <View style={styles.chatFilterRow}>
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel="Show messages from everyone"
          accessibilityState={{ selected: speaker === 'everyone' }}
          onPress={() => setSpeaker('everyone')}
          style={({ pressed }) => [styles.chatFilter, speaker === 'everyone' && styles.chatFilterActive, pressed && styles.pressed]}
        >
          <Text style={[styles.chatFilterText, speaker === 'everyone' && styles.chatFilterTextActive]}>Everyone</Text>
        </FocusPressable>
        {speakers.map(name => (
          <FocusPressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={`Show messages from ${name}`}
            accessibilityState={{ selected: speaker === name }}
            onPress={() => setSpeaker(name)}
            style={({ pressed }) => [styles.chatFilter, speaker === name && styles.chatFilterActive, pressed && styles.pressed]}
          >
            <Text style={[styles.chatFilterText, speaker === name && styles.chatFilterTextActive]}>{name}</Text>
          </FocusPressable>
        ))}
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={onlyCurrent ? 'Show every run' : 'Show only the current run'}
          accessibilityState={{ selected: onlyCurrent }}
          onPress={() => setOnlyCurrent(value => !value)}
          style={({ pressed }) => [styles.chatFilter, onlyCurrent && styles.chatFilterActive, pressed && styles.pressed]}
        >
          <Text style={[styles.chatFilterText, onlyCurrent && styles.chatFilterTextActive]}>{onlyCurrent ? 'This run only' : 'Every run'}</Text>
        </FocusPressable>
      </View>
    </View>

    {visible.length === 0 ? <EmptyState
      title="Nothing said yet"
    /> : <ScrollView style={styles.flexOne} contentContainerStyle={styles.chatList}>
      {visible.map(entry => <View key={`${entry.run.id}-${entry.message.id}`} style={styles.chatMessage}>
        <View style={styles.chatMessageHead}>
          <Text style={styles.chatMessageName}>{entry.message.from}</Text>
          <Text style={styles.chatMessageMeta}>{entry.message.to === 'team' ? 'to the team' : `to ${entry.message.to}`} · {KIND_LABEL[entry.message.kind]}</Text>
        </View>
        <Text style={styles.chatMessageText}>{entry.message.text}</Text>
        <Text style={styles.chatMessageMeta}>{entry.run.brief.slice(0, 60) || entry.run.id}</Text>
      </View>)}
    </ScrollView>}

    <View style={styles.chatComposer}>
      <TextInput
        accessibilityLabel="Message to the agents"
        value={draft}
        onChangeText={setDraft}
        placeholder="Tell the agents what to do next"
        placeholderTextColor={colors.textMuted}
        multiline
        style={[styles.teamInput, styles.chatComposerInput]}
      />
      <Button label="Send to the team" onPress={send} disabled={!draft.trim()} variant="primary" />
      <Button label="Send to Dispatch" onPress={() => { const text = draft.trim(); if (!text) return; onSendToDispatch(text); setDraft(''); }} disabled={!draft.trim()} />
    </View>
  </View>;
});

export { ConversationHomeImpl as ConversationHome };
