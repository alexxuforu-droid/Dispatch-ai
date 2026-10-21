// Evaluate expressions inside the running app to see what the JavaScript environment
// actually looks like, and whether the core initialization module can be run by hand.
const targets = await (await fetch('http://localhost:8081/json/list')).json();
const page = targets.find(t => t.webSocketDebuggerUrl);
if (!page) { console.log('NO_TARGET'); process.exit(1); }

const socket = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const messageId = ++id;
  socket.send(JSON.stringify({ id: messageId, method, params }));
  return messageId;
};
const evaluate = async expression => {
  const messageId = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const result = await new Promise(resolve => {
    pending.set(messageId, message => resolve(message));
    setTimeout(() => { if (pending.has(messageId)) { pending.delete(messageId); resolve({ timeout: true }); } }, 8000);
  });
  if (result?.timeout) return 'TIMEOUT';
  if (result?.exceptionDetails) return 'THREW: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result?.result?.value;
};

socket.addEventListener('open', async () => {
  send('Runtime.enable');
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (const expression of [
    'typeof globalThis.window',
    'Object.keys(globalThis).filter(k => k.indexOf("RN$") === 0).join(",")',
    'typeof globalThis.__r',
    'Object.keys(globalThis.__r ? {r: 1} : {})',
    'typeof globalThis.ErrorUtils',
    'typeof globalThis.AppRegistry',
    'Object.keys(globalThis).filter(k => /metro|__r|__d/i.test(k)).join(",")',
  ]) console.log(`${expression}\n   => ${await evaluate(expression)}`);

  const initId = 'node_modules/react-native-windows/Libraries/Core/InitializeCore.js';
  console.log(`\ntry __r('${initId}') =>`, await evaluate(`(() => { try { globalThis.__r(${JSON.stringify(initId)}); return 'ok'; } catch (e) { return 'THREW: ' + e.message; } })()`));
  console.log('window after =>', await evaluate('typeof globalThis.window'));
  console.log('RN$ globals after =>', await evaluate('Object.keys(globalThis).filter(k => k.indexOf("RN$") === 0).join(",")'));
});

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});

await new Promise(resolve => setTimeout(resolve, 25000));
socket.close();
console.log('done');
