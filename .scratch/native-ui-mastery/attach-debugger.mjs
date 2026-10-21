// Pause on the exception so the failing module is named, then report the stack.
const targets = await (await fetch('http://localhost:8081/json/list')).json();
const page = targets.find(t => t.webSocketDebuggerUrl);
if (!page) { console.log('NO_TARGET'); process.exit(1); }

const socket = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => { const messageId = ++id; socket.send(JSON.stringify({ id: messageId, method, params })); return messageId; };

socket.addEventListener('open', async () => {
  console.log('attached');
  send('Runtime.enable');
  send('Debugger.enable');
  send('Debugger.setPauseOnExceptions', { state: 'all' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await fetch('http://localhost:8081/reload').catch(() => undefined);
  console.log('reloaded');
});

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Debugger.paused') {
    console.log('\n=== PAUSED', message.params.reason, '===');
    (message.params.callFrames ?? []).slice(0, 18).forEach(frame => {
      console.log(`  at ${frame.functionName || '<anon>'} ${frame.url}:${frame.location.lineNumber}:${frame.location.columnNumber}`);
    });
    send('Debugger.resume');
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    console.log(`console.${message.params.type}:`, message.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
});

await new Promise(resolve => setTimeout(resolve, 35000));
socket.close();
console.log('done');
