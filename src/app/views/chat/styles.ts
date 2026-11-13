import { StyleSheet } from 'react-native';
import { colors, radius, space, type } from '../../../theme';

export const chatStyles = StyleSheet.create({
  chatComposer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  chatComposerInput: { flex: 1, minWidth: 220 },
  chatFilter: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chatFilterActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive },
  chatFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chatFilterText: { ...type.meta, color: colors.textQuiet, fontWeight: '600' },
  chatFilterTextActive: { color: colors.text },
  chatHead: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: space.md, paddingBottom: space.md },
  chatList: { flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center', gap: space.sm, paddingBottom: space.lg },
  chatMessage: { padding: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: space.xs },
  chatMessageHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  chatMessageMeta: { ...type.meta, color: colors.textMuted },
  chatMessageName: { ...type.label, color: colors.text },
  chatMessageText: { ...type.bodySmall, lineHeight: 19, color: colors.textQuiet },
  chatPage: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.lg },
});
