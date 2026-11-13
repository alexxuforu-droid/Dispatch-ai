import { StyleSheet } from 'react-native';
import { colors, radius, space, type } from '../../../theme';

export const shellStyles = StyleSheet.create({
  alwaysOnButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  alwaysOnButtonOn: { borderColor: colors.lead, backgroundColor: colors.surfaceActive },
  alwaysOnText: { ...type.meta, color: colors.textQuiet, fontWeight: '600' },
  alwaysOnTextOn: { color: colors.lead },
  // The brand is the mark and nothing else: no wordmark, no caption, no chrome.
  brand: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, marginBottom: space.lg },
  brandCompact: { justifyContent: 'center', paddingHorizontal: 0 },
  brandMark: { width: 40, height: 40, borderRadius: radius.control },
  cancelRunButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: colors.criticalSurface },
  cancelRunText: { ...type.meta, color: colors.critical, fontWeight: '600' },
  contentRow: { flex: 1, flexDirection: 'row', minHeight: 0 },
  mainPane: { flex: 1, minWidth: 0, flexShrink: 1 },
  navGroup: { ...type.meta, color: colors.textMuted, marginTop: space.lg, marginBottom: space.sm, marginHorizontal: space.md },
  navItem: { height: 40, borderRadius: radius.control, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  navItemActive: { backgroundColor: colors.surfaceActive },
  navItemCompact: { width: 44, height: 44, justifyContent: 'center', paddingHorizontal: 0 },
  navList: { gap: space.xs },
  navScroll: { flex: 1, minHeight: 0 },
  navText: { ...type.bodySmall, flex: 1, color: colors.textQuiet },
  navTextActive: { color: colors.text, fontWeight: '600' },
  newRun: { height: 42, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceRaised, marginBottom: space.xxl, gap: space.sm },
  newRunText: { ...type.bodySmall, color: colors.text, fontWeight: '700' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md, marginTop: space.xs },
  profileCaption: { ...type.meta, color: colors.textMuted, marginTop: space.xs },
  profileName: { ...type.meta, color: colors.text, fontWeight: '600' },
  runSetupClose: { width: 44, height: 44 },
  runSetupScroll: { flexShrink: 1, marginTop: space.md },
  runSetupScrollContent: { alignItems: 'center', paddingBottom: space.sm },
  safe: { flex: 1, backgroundColor: colors.page },
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  sidebar: { width: 228, paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.md, backgroundColor: colors.page, borderRightWidth: 1, borderRightColor: colors.line, flexDirection: 'column' },
  sidebarBottom: { gap: space.sm },
  // The rail is a column of 44px targets and nothing else. It is narrower than the labelled
  // sidebar by exactly the space the labels took, so the work column keeps its width when the
  // window is narrow instead of losing it to a wide rail.
  sidebarCompact: { width: 60, paddingHorizontal: space.sm, alignItems: 'center' },
  sidebarSpacer: { flex: 1 },
  statusText: { ...type.meta, color: colors.textQuiet },
  // No top bar: the shell is the sidebar plus the work. What used to live up top (provider
  // status, always-on, stop run) lives in a quiet strip along the bottom instead.
  statusStrip: { minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: space.xl, gap: space.md },
  statusStripRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  workspace: { flex: 1, minWidth: 0, backgroundColor: colors.page },
});
