// Capture the first JavaScript error with its stack: install a global error handler before
// the reload, then read the recorded error back out.
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
  pending.set(messageId, result => resolve(result?.result?.value ?? result?.exceptionDetails?.text ?? 'undefined'));
});

socket.addEventListener('open', async () => {
  console.log('attached');
  send('Runtime.enable');
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log('patch:', await evaluate(`(() => {
    globalThis.__errs = [];
    const utils = globalThis.ErrorUtils;
    if (!utils) return 'no ErrorUtils';
    const current = utils.getGlobalHandler ? utils.getGlobalHandler() : null;
    utils.setGlobalHandler((error, isFatal) => {
      globalThis.__errs.push({ message: String(error && error.message || error), stack: String(error && error.stack || ''), isFatal: !!isFatal });
      if (current) current(error, isFatal);
    });
    return 'handler installed';
  })()`));
  await fetch('http://localhost:8081/reload').catch(() => undefined);
  console.log('reloaded');
  await new Promise(resolve => setTimeout(resolve, 12000));
  console.log('errors:', await evaluate('JSON.stringify(globalThis.__errs || [])'));
});

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
});

await new Promise(resolve => setTimeout(resolve, 28000));
socket.close();
console.log('done');
