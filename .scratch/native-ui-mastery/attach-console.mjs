// Attach to the running app and print what the JavaScript side reports, without reloading.
const targets = await (await fetch('http://localhost:8081/json/list')).json();
const page = targets.find(t => t.webSocketDebuggerUrl);
if (!page) { console.log('NO_TARGET'); process.exit(1); }

const socket = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => { socket.send(JSON.stringify({ id: ++id, method, params })); };

socket.addEventListener('open', () => {
  console.log('attached');
  send('Runtime.enable');
  send('Log.enable');
});

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = (message.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ');
    console.log(`console.${message.params.type}: ${text.slice(0, 300)}`);
  }
  if (message.method === 'Log.entryAdded') {
    console.log(`log ${message.params.entry.level}: ${String(message.params.entry.text).slice(0, 300)}`);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    console.log('exception:', message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
});

await new Promise(resolve => setTimeout(resolve, 15000));
socket.close();
console.log('done');
