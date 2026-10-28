import fs from 'node:fs';

const mode = process.argv[2];
const backupPath = process.argv[3];
if (!['seed', 'restore', 'probe'].includes(mode) || (mode !== 'probe' && !backupPath)) throw new Error('usage: node live-run-fixture.mjs <seed|restore|probe> [backup-path]');
if (mode === 'seed' && fs.existsSync(backupPath)) throw new Error('fixture backup already exists; refusing to overwrite it');

const indexKey = 'dispatch.runs.index.v1';
const targets = await (await fetch('http://localhost:8081/json/list')).json();
const target = targets.find(entry => entry.webSocketDebuggerUrl);
if (!target) throw new Error('Metro has no active React Native target');

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
};
const callback = async start => {
  await evaluate(`(() => { globalThis.__liveFixtureResult = null; ${start}; return 'started'; })()`);
  for (let attempt = 0; attempt < 60; attempt++) {
    const raw = await evaluate('JSON.stringify(globalThis.__liveFixtureResult)');
    if (raw && raw !== 'null') {
      const result = JSON.parse(raw);
      if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('AsyncStorage callback did not complete within six seconds');
};
const readIndex = async () => {
  const result = await callback(`globalThis.nativeModuleProxy.RNCAsyncStorage.multiGet([${JSON.stringify(indexKey)}], (errors, rows) => { globalThis.__liveFixtureResult = { errors, rows }; })`);
  return result.rows?.[0]?.[1] ?? null;
};
const multiSet = pairs => callback(`globalThis.nativeModuleProxy.RNCAsyncStorage.multiSet(${JSON.stringify(pairs)}, errors => { globalThis.__liveFixtureResult = { errors }; })`);
const multiRemove = keys => callback(`globalThis.nativeModuleProxy.RNCAsyncStorage.multiRemove(${JSON.stringify(keys)}, errors => { globalThis.__liveFixtureResult = { errors }; })`);

try {
  await call('Runtime.enable');
  if (mode === 'probe') {
    const result = await callback(`globalThis.nativeModuleProxy.RNCAsyncStorage.multiGet([${JSON.stringify(indexKey)}], (errors, rows) => { globalThis.__liveFixtureResult = { errors, rows }; })`);
    const rows = result.rows;
    const shape = { errorType: typeof result.errors, errorsArray: Array.isArray(result.errors), resultType: typeof rows, resultArray: Array.isArray(rows), firstType: typeof rows?.[0], firstArray: Array.isArray(rows?.[0]), firstKeys: rows?.[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [], secondType: typeof rows?.[0]?.[1], secondKeys: rows?.[0]?.[1] && typeof rows[0][1] === 'object' ? Object.keys(rows[0][1]) : [] };
    console.log(JSON.stringify(shape));
  } else if (mode === 'seed') {
    const originalIndex = await readIndex();
    const ids = originalIndex ? JSON.parse(originalIndex) : [];
    if (!Array.isArray(ids)) throw new Error('run index is not an array; refusing to alter it');
    const id = `run-ui-fixture-${Date.now().toString(36)}`;
    const snapshotKey = `dispatch.run.${id}.snapshot.v1`;
    const eventKey = `dispatch.run.${id}.events.v1`;
    const fixtureMessages = [
      { from: 'Planner', to: 'Builder', kind: 'handoff', text: 'Keep the release title and publication time visible before the summary.' },
      { from: 'Builder', to: 'team', kind: 'update', text: 'The date and author now sit above the summary, and the tags wrap without horizontal scrolling.' },
      { from: 'Planner', to: 'team', kind: 'update', text: 'The existing summary remains in the entry below the author and time.' },
      { from: 'Builder', to: 'Planner', kind: 'question', text: 'The longest release title wraps on the narrowest supported window. I kept the text size unchanged.' },
      { from: 'Planner', to: 'Builder', kind: 'update', text: 'That is fine. Keep the row readable before reducing type size.' },
      { from: 'Builder', to: 'team', kind: 'update', text: 'I checked the entry at both narrow and wide window sizes.' },
      { from: 'Code reviewer', to: 'team', kind: 'update', text: 'The proposed row keeps the release, author, time, summary, and tags together.' },
      { from: 'Builder', to: 'team', kind: 'handoff', text: 'The revised component is staged for review.' },
      { from: 'Planner', to: 'team', kind: 'update', text: 'The dependent plan steps are complete.' },
      { from: 'Builder', to: 'team', kind: 'update', text: 'The summary remains visible below the metadata row.' },
      { from: 'Code reviewer', to: 'Builder', kind: 'handoff', text: 'The final diff retains all requested release-note fields.' },
      { from: 'Builder', to: 'team', kind: 'update', text: 'Review is complete. The output is ready to apply to a project.' },
    ].map((message, index) => ({ ...message, id: `fixture-message-${index + 1}`, runId: id, workItemId: index === 0 ? 'item-1' : 'item-2', createdAt: `2026-10-21T18:${String(4 + index * 2).padStart(2, '0')}:00.000Z` }));
    const run = {
      id,
      brief: 'Review the release notes layout and keep the published time visible.',
      status: 'completed',
      teamId: 'team-default',
      mission: { id: 'review-ui', name: 'Review the release notes layout', output: 'code' },
      items: [
        { id: 'item-1', title: 'Check the page hierarchy', kind: 'plan', agentId: 'planner', dependsOn: [], status: 'done', artifactIds: [] },
        { id: 'item-2', title: 'Keep date and author above the summary', kind: 'code', agentId: 'builder', dependsOn: ['item-1'], status: 'done', artifactIds: [] },
      ],
      messages: fixtureMessages,
      artifacts: [],
      changes: [{ id: 'fixture-change', itemId: 'item-2', path: 'src/release/ReleaseNotes.tsx', before: 'export function ReleaseNotes() {\n  return <Text>{summary}</Text>;\n}', after: 'export function ReleaseNotes() {\n  return <View>\n    <Text>{author} · {publishedAt}</Text>\n    <Text>{summary}</Text>\n  </View>;\n}', createOnly: false, createdBy: 'Builder', attempt: 1 }],
      createdAt: '2026-10-21T18:01:00.000Z',
      updatedAt: '2026-10-21T18:19:00.000Z',
    };
    fs.writeFileSync(backupPath, JSON.stringify({ originalIndex, id, snapshotKey, eventKey }), 'utf8');
    await multiSet([[indexKey, JSON.stringify([id, ...ids])], [snapshotKey, JSON.stringify(run)]]);
    const storedIndex = await readIndex();
    if (!storedIndex || !JSON.parse(storedIndex).includes(id)) {
      await multiRemove([snapshotKey, eventKey]);
      if (originalIndex === null) await multiRemove([indexKey]);
      else await multiSet([[indexKey, originalIndex]]);
      fs.unlinkSync(backupPath);
      throw new Error('fixture run index read-back failed; original index restored');
    }
    console.log(`SEEDED ${id}; original run index preserved for restoration`);
  } else {
    if (!fs.existsSync(backupPath)) throw new Error('fixture backup is missing; refusing a blind cleanup');
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    await multiRemove([backup.snapshotKey, backup.eventKey]);
    if (backup.originalIndex === null) await multiRemove([indexKey]);
    else await multiSet([[indexKey, backup.originalIndex]]);
    if (await readIndex() !== backup.originalIndex) throw new Error('original run index did not read back exactly');
    fs.unlinkSync(backupPath);
    console.log('RESTORED original run index; removed only the temporary fixture keys');
  }
} finally {
  socket.close();
}
