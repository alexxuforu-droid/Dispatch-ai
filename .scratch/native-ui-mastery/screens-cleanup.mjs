// The remaining screens: drop the uppercase path labels, quiet the chips, and give every
// empty surface the shared empty state with one sentence and one action.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 80)); return; }
  text = text.replace(from, to);
};

// The path label above every page title: the top bar already names the page.
text = text.replace(/<Text style=\{styles\.collectionPath\}>[^<]*<\/Text>/g, '');

// The page title is a title now, not a headline.
swap(
  "collectionHeading: { color: colors.text, fontFamily: typography.display, fontSize: 34, fontWeight: '600', letterSpacing: -1, marginTop: 16 }",
  "collectionHeading: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600', marginTop: 0 }",
);
swap(
  "collectionBody: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 14, lineHeight: 22, maxWidth: 550, marginTop: 8 }",
  "collectionBody: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 13, lineHeight: 19, maxWidth: 550, marginTop: 6 }",
);

// The empty states.
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>Usage history could not be read</Text><Text style={styles.teamSectionBody}>{discardFailed ? 'The local usage history could not be confirmed as cleared. It may be partly removed; try again or leave it alone.' : 'The local usage ledger did not load. Nothing is lost until you discard it.'}</Text><Button label="Discard local usage history" accessibilityLabel="Discard local usage history" onPress={discardUsageHistory} variant="critical" /></View>`,
  `<EmptyState title="Usage history could not be read" sentence={discardFailed ? 'The local usage history could not be confirmed as cleared. It may be partly removed; try again or leave it alone.' : 'The local usage ledger did not load. Nothing is lost until you discard it.'} action={<Button label="Discard local usage history" accessibilityLabel="Discard local usage history" onPress={discardUsageHistory} variant="critical" />} />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>Reading usage history</Text><Text style={styles.teamSectionBody}>Loading recorded provider calls from this device.</Text></View>`,
  `<EmptyState title="Reading usage history" sentence="Loading recorded provider calls from this device." />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>No provider calls recorded yet</Text><Text style={styles.teamSectionBody}>Plan a run and start a coordinated team. Each planner, builder, and reviewer call is recorded here as it happens.</Text></View>`,
  `<EmptyState title="No provider calls recorded yet" sentence="Plan a run and start a coordinated team. Each planner, builder, and reviewer call is recorded here as it happens." />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>No saved team yet</Text><Text style={styles.teamSectionBody}>Create a team from your existing agent profiles to set its hierarchy and permissions.</Text><Button label="Create a team" onPress={() => setSection('teams')} /></View>`,
  `<EmptyState title="No saved team yet" sentence="Create a team from your existing agent profiles to set its hierarchy and permissions." action={<Button label="Create a team" onPress={() => setSection('teams')} />} />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>Start with your existing agents</Text><Text style={styles.teamSectionBody}>Create your first team, then choose it for a new run.</Text></View>`,
  `<EmptyState title="Start with your existing agents" sentence="Create your first team, then choose it for a new run." action={<Button label="Create a team" onPress={() => setSection('teams')} />} />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>{activeTeam ? 'No conversations yet' : 'Choose a team to see its conversation'}</Text><Text style={styles.teamSectionBody}>Agent discussion and review updates appear here after the team starts a run.</Text></View>`,
  `<EmptyState title={activeTeam ? 'No conversations yet' : 'Choose a team to see its conversation'} sentence="Agent discussion and review updates appear here after the team starts a run." />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>No tasks on the board</Text><Text style={styles.teamSectionBody}>Start a run and the planned tasks will appear here with their owners and dependencies.</Text></View>`,
  `<EmptyState title="No tasks on the board" sentence="Start a run and the planned tasks will appear here with their owners and dependencies." action={<Button label="Start a run" onPress={() => setScreen('dispatch')} />} />`,
);
swap(
  `<View style={styles.emptyTeamNotice}><Text style={styles.savedTeamName}>No workflows saved</Text><Text style={styles.teamSectionBody}>Create one above from a task your team repeats.</Text></View>`,
  `<EmptyState title="No workflows saved" sentence="Create one above from a task your team repeats." />`,
);

// The remaining uppercase labels.
swap(
  "<Text style={styles.savedRoleState}>{agentModels[role.id]?.trim() ? 'CUSTOM MODEL' : providerReady ? 'DEFAULT MODEL' : 'PROVIDER NEEDED'}</Text>",
  "<Text style={styles.savedRoleState}>{agentModels[role.id]?.trim() ? 'Custom model' : providerReady ? 'Default model' : 'Provider needed'}</Text>",
);
swap(
  "<Text style={styles.avatarChooseLabel}>CHANGE AVATAR</Text>",
  "",
);
swap(
  "<Text style={styles.agentPermissionFoot}>RECENT WORK · {completedTasks}/{agentTasks.length} complete · {flaggedTasks} flagged</Text>",
  "<Text style={styles.agentPermissionFoot}>Recent work · {completedTasks}/{agentTasks.length} complete · {flaggedTasks} flagged</Text>",
);
swap(
  "<Text style={styles.agentCardFoot}>RANK · {rankNames[rank - 1]}</Text>",
  "<Text style={styles.agentCardFoot}>Rank · {rankNames[rank - 1]}</Text>",
);
swap(
  "<Text style={styles.agentCardStatus}>{model.trim() ? 'CUSTOM MODEL' : 'WORKSPACE DEFAULT'}</Text>",
  "<Text style={styles.agentCardStatus}>{model.trim() ? 'Custom model' : 'Workspace default'}</Text>",
);
swap(
  "<Text style={styles.boardKind}>{item.kind.toUpperCase()}</Text>",
  "<Text style={styles.boardKind}>{item.kind}</Text>",
);
swap(
  "<Text style={styles.teamChatKind}>{message.kind.toUpperCase()} · {new Date(message.createdAt).toLocaleTimeString()}</Text>",
  "<Text style={styles.teamChatKind}>{message.kind} · {new Date(message.createdAt).toLocaleTimeString()}</Text>",
);
swap(
  "<Text style={styles.promptCardMeta}>{preset.mission.name} · {preset.mission.output.toUpperCase()}</Text>",
  "<Text style={styles.promptCardMeta}>{preset.mission.name} · {preset.mission.output}</Text>",
);
swap(
  "<Text style={styles.promptCardMeta}>{starter.mission.name} · {starter.mission.output.toUpperCase()}</Text>",
  "<Text style={styles.promptCardMeta}>{starter.mission.name} · {starter.mission.output}</Text>",
);

// The selected chips are quiet surfaces with a stronger border.
swap(
  "teamTabActive: { backgroundColor: colors.support }",
  "teamTabActive: { backgroundColor: colors.surfaceActive }",
);
swap(
  "teamChipActive: { borderColor: colors.lead, backgroundColor: colors.support }",
  "teamChipActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive }",
);

// The empty state no longer sits in a tinted square.
swap(
  "emptyIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.support, justifyContent: 'center', alignItems: 'center', marginBottom: 13 }",
  "emptyIcon: { marginBottom: 4 }",
);

fs.writeFileSync(file, text, 'utf8');
console.log('remaining screens cleaned');
