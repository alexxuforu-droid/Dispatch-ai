// Evaluate expressions inside the running app. The Chrome DevTools Protocol reply nests the
// value under result.result.value, which is easy to read at the wrong level.
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
const evaluate = expression => new Promise(resolve => {
  const messageId = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  pending.set(messageId, message => {
    if (message?.result?.result?.value !== undefined) {
      const value = message.result.result.value;
      return resolve(typeof value === 'string' ? value : JSON.stringify(value));
    }
    if (message?.result?.exceptionDetails) return resolve('THREW: ' + (message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text));
    resolve('NO VALUE ' + JSON.stringify(message).slice(0, 300));
  });
  setTimeout(() => { if (pending.has(messageId)) { pending.delete(messageId); resolve('TIMEOUT'); } }, 8000);
});

socket.addEventListener('open', async () => {
  send('Runtime.enable');
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Expressions come from a file: passing them as arguments breaks on quoting.
  const expressions = JSON.parse(await (await import('node:fs/promises')).readFile(process.argv[2], 'utf8'));
  for (const expression of expressions) {
    console.log(`${expression}\n   => ${await evaluate(expression)}`);
  }
});

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});

await new Promise(resolve => setTimeout(resolve, 20000));
socket.close();
console.log('done');
