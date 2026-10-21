// The run thread on the Dispatch screen: one measure with the rest of the page, the agent
// name beside the avatar instead of floating in the middle, and no coloured bar down the
// edge of a message.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

// The thread sits on the same measure as the page around it.
swap(
  "thread: { width: '100%', maxWidth: 690, alignSelf: 'center', paddingTop: 15, paddingBottom: 20 }",
  "thread: { width: '100%', maxWidth: 760, paddingTop: 15, paddingBottom: 20 }",
);

// The name belongs next to the avatar.
swap(
  "agentMessageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }",
  "agentMessageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginBottom: 7 }, agentMessageWho: { flexDirection: 'row', alignItems: 'center', gap: space.sm }",
);
swap(
  "<View style={styles.agentMessageHead}>{agent ? <AgentAvatar avatarId={agent.avatarId ?? 1} size={26} /> : null}<Text style={styles.agentMessageName}>{message.from}</Text><Text style={styles.agentMessageKind}>{message.kind.toUpperCase()}</Text></View>",
  "<View style={styles.agentMessageHead}><View style={styles.agentMessageWho}>{agent ? <AgentAvatar avatarId={agent.avatarId ?? 1} size={26} /> : null}<Text style={styles.agentMessageName}>{message.from}</Text></View><Text style={styles.agentMessageKind}>{message.kind.toUpperCase()}</Text></View>",
);

// A finding is marked by its word, not by a coloured edge.
swap(
  "agentMessage: { padding: 13, borderLeftWidth: 2, borderLeftColor: colors.line, backgroundColor: colors.surface, borderRadius: 6, marginBottom: 9 }, agentMessageFinding: { borderLeftColor: colors.attention, backgroundColor: colors.attentionSurface }",
  "agentMessage: { padding: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, marginBottom: 9 }, agentMessageFinding: { borderColor: colors.attentionSurface, backgroundColor: colors.attentionSurface }",
);

swap(
  "agentMessageKind: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, letterSpacing: .6 }",
  "agentMessageKind: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }",
);

fs.writeFileSync(file, text, 'utf8');
console.log('thread layout updated');
