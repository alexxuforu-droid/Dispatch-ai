import React from 'react';
import { Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { Run } from '../../../orchestration/types';
import { Button, EmptyState, Row, Section, Toggle } from '../../../ui';
import { Role } from '../../types';
import { AgentAvatar } from '../pickers/AgentAvatar';
import { styles } from '../styles';

const RunInspectorImpl = React.memo(function RunInspector({ roles, agentModels, agentAvatars, run, providerReady, onConfigure, reviewCode, setReviewCode, reviewImages, setReviewImages, showTitle = true }: { roles: Role[]; agentModels: Record<string, string>; agentAvatars: Record<string, number>; run: Run | null; providerReady: boolean; onConfigure: () => void; reviewCode: boolean; setReviewCode: (value: boolean) => void; reviewImages: boolean; setReviewImages: (value: boolean) => void; showTitle?: boolean }) {
  return <View style={styles.inspector}>
    {showTitle ? <Text style={styles.inspectorTitle}>Run setup</Text> : null}
    <Section title="Agent team" action={<Button label={roles.length ? 'Edit' : 'Add'} onPress={onConfigure} variant="ghost" />}>
      {!roles.length ? <EmptyState icon={<DispatchIcon name="team" size={20} color={colors.textQuiet} />} title="No team assigned" sentence="Choose agent roles to plan, build, and review this run." action={<Button label="Build a team" onPress={onConfigure} icon={<DispatchIcon name="plus" size={16} color={colors.text} />} />} />
        : roles.map((role, index) => { const model = run?.agentModelIds ? run.agentModelIds[role.id] : agentModels[role.id]; const profile = run?.agentProfiles?.find(agent => agent.id === role.id); return <Row key={role.id} title={role.label} detail={providerReady ? model || 'Workspace default model' : 'Provider needed'} trailing={<AgentAvatar avatarId={profile?.avatarId ?? agentAvatars[role.id] ?? index + 1} size={30} name={profile?.name ?? role.label} />} />; })}
    </Section>
    <Section title="Review policy" supporting="Each deliverable gets a separate review pass.">
      <Toggle label="Code proposals" detail="An independent model reviews generated code. With it off, proposals stay staged for you." value={reviewCode} onChange={setReviewCode} />
      <Toggle label="Automatic image review" detail="The configured model inspects generated image pixels. Uncertain results are held for you." value={reviewImages} onChange={setReviewImages} />
    </Section>
    <View style={styles.inspectorNote}><DispatchIcon name="check" size={13} color={colors.textQuiet} /><Text style={styles.privacyText}>Nothing is applied until you approve it, or a qualified senior reviewer approves and applies it.</Text></View>
  </View>;
});

export { RunInspectorImpl as RunInspector };
