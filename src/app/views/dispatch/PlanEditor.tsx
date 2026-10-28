import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { WorkItem } from '../../../orchestration/types';
import { PlanEditResult, reassignWorkItem, setDependency } from '../../policy/planEditing';
import { FocusPressable } from '../../../Reveal';
import { styles } from '../styles';

/** One agent that can own a step. */
export type PlanOwner = { id: string; name: string };

/**
 * The owner and dependency editor for a run's plan.
 *
 * The rules live in the policy module, so the screen only asks for the edit and reports
 * what came back. A refused edit says why, in words, next to the step it was refused for.
 * The edited items are reported upward, because saving them is the composition root's job.
 */
export function PlanEditor({ items, owners, onEdit }: { items: WorkItem[]; owners: PlanOwner[]; onEdit: (items: WorkItem[]) => void }) {
  const [draft, setDraft] = useState(items);
  const [refusal, setRefusal] = useState<{ itemId: string; reason: string } | null>(null);
  // The plan the person is editing is the one on screen, so an edit shows immediately even
  // before the run behind it is saved.
  useEffect(() => setDraft(items), [items]);

  const apply = (itemId: string, result: PlanEditResult) => {
    if (!result.ok) { setRefusal({ itemId, reason: result.reason }); return; }
    setRefusal(null);
    setDraft(result.items);
    onEdit(result.items);
  };
  const agentIds = owners.map(owner => owner.id);

  return <View style={styles.planEditor}>
    {draft.map((item, index) => {
      const others = draft.filter(candidate => candidate.id !== item.id);
      return <View key={item.id} style={styles.planEditorItem}>
        <Text style={styles.planEditorLabel}>Step {index + 1} · owner</Text>
        <View style={styles.planEditorRow}>
          {owners.map(owner => {
            const selected = item.agentId === owner.id;
            return <FocusPressable key={owner.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`Give step ${index + 1}, ${item.title}, to ${owner.name}`} onPress={() => apply(item.id, reassignWorkItem(draft, item.id, owner.id, agentIds))} style={({ pressed }) => [styles.planChip, selected && styles.planChipActive, pressed && styles.pressed]}>
              <Text style={[styles.planChipText, selected && styles.planChipTextActive]}>{owner.name}</Text>
            </FocusPressable>;
          })}
        </View>
        <Text style={styles.planEditorLabel}>Runs after</Text>
        <View style={styles.planEditorRow}>
          {others.map(other => {
            const otherIndex = draft.findIndex(candidate => candidate.id === other.id);
            const on = item.dependsOn.includes(other.id);
            return <FocusPressable key={other.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${on ? 'Remove' : 'Add'} the dependency on step ${otherIndex + 1}, ${other.title}`} onPress={() => apply(item.id, setDependency(draft, item.id, other.id, !on))} style={({ pressed }) => [styles.planChip, on && styles.planChipActive, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={[styles.planChipText, on && styles.planChipTextActive]}>{otherIndex + 1}. {other.title}</Text>
            </FocusPressable>;
          })}
        </View>
        {refusal?.itemId === item.id ? <Text accessibilityRole="alert" style={styles.planRefusal}>{refusal.reason}</Text> : null}
      </View>;
    })}
  </View>;
}
