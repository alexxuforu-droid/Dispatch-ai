// Seed one realistic run into the app's storage, so the review surface can be seen with
// work in it. The screens were designed empty, and an empty screen cannot be judged.
//
// The writes go through the storage native module directly, with a callback, because the
// inspector that carries the evaluation suspends timers: a promise that waits on one never
// settles while the inspector is attached.
//
//   node .scratch/native-ui-mastery/seed-run.mjs

const run = {
  id: 'run-seeded-release-notes',
  brief: 'Tighten the release notes screen so a reviewer can see what changed without scrolling.',
  status: 'needs-approval',
  teamId: 'team-default',
  mission: { id: 'polish-a-screen', name: 'Polish a screen', output: 'mixed' },
  checkpointPolicy: 'plan-only',
  agentModelIds: { planner: 'gpt-5', builder: 'gpt-5', reviewer: 'gpt-5' },
  agentProfiles: [
    { id: 'planner', name: 'Planner', role: 'Planner', modelId: 'gpt-5', avatarId: 3, rank: 3, kinds: ['plan'], instructions: 'Breaks the brief into a sequenced plan.', permissions: { read: true, grep: true, write: false, edit: false } },
    { id: 'builder', name: 'Builder', role: 'Builder', modelId: 'gpt-5', avatarId: 7, rank: 2, kinds: ['code', 'image'], instructions: 'Makes the change and explains it.', permissions: { read: true, grep: true, write: true, edit: true } },
    { id: 'reviewer', name: 'Code reviewer', role: 'Code reviewer', modelId: 'gpt-5', avatarId: 11, rank: 4, kinds: ['code', 'review'], instructions: 'Checks the change against the brief and the tests.', permissions: { read: true, grep: true, write: false, edit: false } },
  ],
  items: [
    { id: 'item-1', title: 'List the fields the reviewer needs first', kind: 'plan', agentId: 'planner', dependsOn: [], status: 'done', artifactIds: [] },
    { id: 'item-2', title: 'Move the date and tag rows above the summary', kind: 'code', agentId: 'builder', dependsOn: ['item-1'], status: 'done', artifactIds: [] },
    { id: 'item-3', title: 'Check the diff against the brief and the tests', kind: 'review', agentId: 'reviewer', dependsOn: ['item-2'], status: 'needs-approval', artifactIds: [] },
    { id: 'item-4', title: 'Render a before and after image of the screen', kind: 'image', agentId: 'builder', dependsOn: ['item-2'], status: 'cancelled', artifactIds: [] },
  ],
  messages: [
    { id: 'msg-1', runId: 'run-seeded-release-notes', workItemId: 'item-1', from: 'Planner', to: 'Builder', kind: 'handoff', text: 'Three things move above the fold: the release name, the author and the time. The tag row wraps instead of scrolling, and the summary keeps one line.', createdAt: '2026-10-21T18:04:00.000Z' },
    { id: 'msg-2', runId: 'run-seeded-release-notes', workItemId: 'item-2', from: 'Builder', to: 'Planner', kind: 'question', text: 'The tag row needs a second line at 900 pixels. Do I shrink the tag text, or let the row wrap?', createdAt: '2026-10-21T18:11:00.000Z' },
    { id: 'msg-3', runId: 'run-seeded-release-notes', workItemId: 'item-2', from: 'Builder', to: 'team', kind: 'update', text: 'Left the row wrapping and kept the tag text at 12 pixels. The summary line now holds two lines instead of one.', createdAt: '2026-10-21T18:19:00.000Z' },
    { id: 'msg-4', runId: 'run-seeded-release-notes', workItemId: 'item-3', from: 'Code reviewer', to: 'team', kind: 'finding', text: 'The diff drops the published time without putting it back anywhere, so a reviewer cannot tell when a note went out. Put the time next to the author, then this is ready to apply.', createdAt: '2026-10-21T18:26:00.000Z' },
  ],
  artifacts: [],
  changes: [
    {
      id: 'change-1',
      itemId: 'item-2',
      path: 'src/release/ReleaseNotes.tsx',
      createOnly: false,
      createdBy: 'Builder',
      attempt: 1,
      before: `export function ReleaseNotes({ notes }: Props) {
  return (
    <View style={styles.list}>
      {notes.map(note => (
        <View key={note.id} style={styles.row}>
          <Text style={styles.summary}>{note.summary}</Text>
          <Text style={styles.date}>{note.published}</Text>
        </View>
      ))}
    </View>
  );
}`,
      after: `export function ReleaseNotes({ notes }: Props) {
  return (
    <View style={styles.list}>
      {notes.map(note => (
        <View key={note.id} style={styles.row}>
          <Text style={styles.release}>{note.release}</Text>
          <Text style={styles.author}>{note.author}</Text>
          <Text style={styles.time}>{note.time}</Text>
          <Text style={styles.summary}>{note.summary}</Text>
          <View style={styles.tags}>
            {note.tags.map(tag => (
              <Text key={tag} style={styles.tag}>{tag}</Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}`,
    },
  ],
  createdAt: '2026-10-21T18:01:00.000Z',
  updatedAt: '2026-10-21T18:26:00.000Z',
};

const pairs = [
  ['dispatch.runs.index.v1', JSON.stringify([run.id])],
  [`dispatch.run.${run.id}.snapshot.v1`, JSON.stringify(run)],
];

const expression = `(() => {
  globalThis.__seed = 'pending';
  try {
    const m = globalThis.nativeModuleProxy['RNCAsyncStorage'];
    m.multiSet(${JSON.stringify(pairs)}, errors => {
      globalThis.__seed = errors && errors.length ? 'errors: ' + JSON.stringify(errors) : 'stored';
    });
  } catch (e) { globalThis.__seed = 'threw: ' + e.message; }
  return 'started';
})()`;

const targets = await (await fetch('http://localhost:8081/json/list')).json();
const page = targets.find(target => target.webSocketDebuggerUrl);
if (!page) { console.log('NO_TARGET'); process.exit(1); }

const socket = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const messageId = ++id;
  socket.send(JSON.stringify({ id: messageId, method, params }));
  return messageId;
};

socket.addEventListener('open', async () => {
  send('Runtime.enable');
  await new Promise(resolve => setTimeout(resolve, 800));
  const messageId = send('Runtime.evaluate', { expression, returnByValue: true });
  pending.set(messageId, message => { console.log('seed call:', message?.result?.result?.value ?? 'sent'); });
});

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});

await new Promise(resolve => setTimeout(resolve, 6000));

const read = send('Runtime.evaluate', { expression: "String(globalThis.__seed)", returnByValue: true });
pending.set(read, message => { console.log('seed result:', message?.result?.result?.value ?? 'unknown'); socket.close(); });

await new Promise(resolve => setTimeout(resolve, 6000));
console.log('done');
