import React, { useState } from 'react';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { WorkKind } from '../../../orchestration/types';
import { FocusPressable, isEscapeEvent, keyHandlerProps, useInitialFocus } from '../../../Reveal';
import { Role, sentenceCase } from '../../types';
import { styles } from '../styles';

const TeamPickerImpl = React.memo(function TeamPicker({ visible, roles, pending, setPending, onAddRole, onClose, onSave }: { visible: boolean; roles: Role[]; pending: string[]; setPending: (ids: string[]) => void; onAddRole: (role: Role) => void; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [kinds, setKinds] = useState<WorkKind[]>(['code']);
  // The dialog takes the keyboard when it opens, and Escape puts it away again.
  const dialogFocus = useInitialFocus<View>(visible);
  const toggle = (id: string) => setPending(pending.includes(id) ? pending.filter(role => role !== id) : [...pending, id]);
  const addRole = () => {
    const label = name.trim().slice(0, 48);
    const description = detail.trim().slice(0, 240);
    if (!label || !description || !kinds.length) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'agent';
    let id = `custom-${slug}`;
    let suffix = 2;
    while (roles.some(role => role.id === id)) id = `custom-${slug}-${suffix++}`;
    onAddRole({ id, label, detail: description, glyph: 'build', kinds: [...kinds] });
    setName(''); setDetail(''); setKinds(['code']);
  };
  const toggleKind = (kind: WorkKind) => setKinds(current => current.includes(kind) ? current.filter(value => value !== kind) : [...current, kind]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalBackdrop} {...keyHandlerProps(event => { if (isEscapeEvent(event)) onClose(); })}>
    <View ref={dialogFocus} focusable accessibilityViewIsModal accessibilityLabel="Shape your team" style={styles.modal}>
      <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Shape your team</Text></View><FocusPressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.modalClose}><DispatchIcon name="close" size={17} color={colors.textQuiet} /></FocusPressable></View>
      <Text style={styles.modalBody}>Choose specialist roles or create your own. Each agent can receive specific kinds of work.</Text>
      <ScrollView style={styles.rolePickerScroll} contentContainerStyle={styles.rolePickerContent}>
      <View style={styles.roleList}>{roles.map(role => {
        const selected = pending.includes(role.id);
        const glyph = role.glyph === 'plan' ? 'dispatch' : role.glyph === 'build' ? 'runs' : role.glyph === 'visual' ? 'spark' : 'reviews';
        return <FocusPressable key={role.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggle(role.id)} style={({ pressed }) => [styles.roleOption, selected && styles.roleOptionSelected, pressed && styles.pressed]}>
          <View style={[styles.roleIcon, selected && styles.roleIconSelected]}><DispatchIcon name={glyph} size={18} color={selected ? colors.lead : colors.textQuiet} /></View>
          <View style={styles.flexOne}><Text style={styles.roleTitle}>{role.label}</Text><Text style={styles.roleDetail}>{role.detail}</Text><Text style={styles.roleDetail}>{role.kinds.map(kind => kind).join(' · ')}{role.id.startsWith('custom-') ? ' · CUSTOM' : ''}</Text></View>
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <DispatchIcon name="check" size={13} color={colors.leadInk} />}</View>
        </FocusPressable>;
      })}</View>
      <View style={styles.customRoleEditor}><Text style={styles.customRoleHeading}>Create a specialist</Text><TextInput accessibilityLabel="New agent name" value={name} onChangeText={setName} placeholder="Agent name" placeholderTextColor={colors.textMuted} style={styles.providerInput} maxLength={48} /><TextInput accessibilityLabel="New agent instructions" value={detail} onChangeText={setDetail} placeholder="Describe its responsibilities" placeholderTextColor={colors.textMuted} style={[styles.providerInput, styles.customRoleDescription]} multiline maxLength={240} textAlignVertical="top" /><Text style={styles.fieldLabel}>Can work on</Text><View style={styles.customRoleKinds}>{(['plan', 'code', 'image', 'review'] as WorkKind[]).map(kind => <FocusPressable key={kind} accessibilityRole="checkbox" accessibilityState={{ checked: kinds.includes(kind) }} onPress={() => toggleKind(kind)} style={[styles.customKindButton, kinds.includes(kind) && styles.customKindButtonActive]}><Text style={[styles.customKindText, kinds.includes(kind) && styles.customKindTextActive]}>{sentenceCase(kind)}</Text></FocusPressable>)}</View><FocusPressable accessibilityRole="button" disabled={!name.trim() || !detail.trim() || !kinds.length} onPress={addRole} style={({ pressed }) => [styles.customRoleAdd, (!name.trim() || !detail.trim() || !kinds.length) && styles.customRoleAddDisabled, pressed && styles.pressed]}><Text style={styles.customRoleAddText}>Add specialist to team</Text></FocusPressable></View>
      </ScrollView>
      <View style={styles.modalFooter}><Text style={styles.modalSelection}>{pending.length} {pending.length === 1 ? 'role' : 'roles'} selected</Text><FocusPressable accessibilityRole="button" onPress={onSave} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}><Text style={styles.primaryActionText}>Save team</Text></FocusPressable></View>
    </View></View>
  </Modal>;
});

export { TeamPickerImpl as TeamPicker };
