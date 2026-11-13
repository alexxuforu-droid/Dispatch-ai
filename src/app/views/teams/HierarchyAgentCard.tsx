import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { colors } from '../../../theme';
import { AgentPermissions } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { Toggle } from '../../../ui';
import { Role, rankNames } from '../../types';
import { AgentAvatar } from '../pickers/AgentAvatar';
import { styles } from '../styles';

const HierarchyAgentCardImpl = React.memo(function HierarchyAgentCard({ role, avatar, rank, permissions, memory, setMemory, setRank, setPermission }: { role: Role; avatar: number; rank: number; permissions: AgentPermissions; memory: string; setMemory: (value: string) => void; setRank: (id: string, value: number) => void; setPermission: (id: string, key: keyof AgentPermissions, value: boolean) => void }) {
  return <View style={styles.hierarchyAgent}><View style={styles.hierarchyAgentHead}><AgentAvatar avatarId={avatar} size={36} /><View style={styles.flexOne}><Text style={styles.savedRoleName}>{role.label}</Text><Text style={styles.savedRoleDetail}>{role.detail}</Text></View><Text style={styles.hierarchyRankTag}>{rankNames[rank - 1]}</Text></View><View style={styles.hierarchyAgentSettings}><View style={styles.hierarchyControl}><Text style={styles.fieldLabel}>RANK</Text><View style={styles.agentRankRow}>{rankNames.map((name, index) => <FocusPressable key={name} accessibilityRole="radio" accessibilityLabel={`Set ${role.label} rank to ${name}`} accessibilityState={{ checked: rank === index + 1 }} onPress={() => setRank(role.id, index + 1)} style={[styles.agentRankOption, rank === index + 1 && styles.agentRankOptionActive]}><Text style={[styles.agentRankText, rank === index + 1 && styles.agentRankTextActive]}>{index + 1}</Text></FocusPressable>)}</View></View><View style={styles.hierarchyToolControls}>{(['read', 'grep', 'write', 'edit'] as const).map(key => <Toggle key={key} label={{ read: 'Read', grep: 'Grep', write: 'Write', edit: 'Edit' }[key]} detail={{ read: 'Open files', grep: 'Search text', write: 'Create files', edit: 'Edit files' }[key]} value={permissions[key]} onChange={value => setPermission(role.id, key, value)} />)}</View><View style={styles.agentMemoryWrap}><Text style={styles.fieldLabel}>APPROVED AGENT MEMORY</Text><TextInput accessibilityLabel={`${role.label} approved agent memory`} value={memory} onChangeText={setMemory} maxLength={3000} multiline placeholder="Project conventions or decisions to remember" placeholderTextColor={colors.textMuted} style={styles.agentMemoryInput} /></View></View></View>;
});

export { HierarchyAgentCardImpl as HierarchyAgentCard };
