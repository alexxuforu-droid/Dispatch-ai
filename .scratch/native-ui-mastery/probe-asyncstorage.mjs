// Which module ids does the bundle give the async-storage package?
import http from 'node:http';

http.get('http://localhost:8081/index.bundle?platform=windows&dev=true&hot=true&inlineSourceMap=true', res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    const ids = new Set();
    for (const match of body.matchAll(/"(node_modules\/@react-native-async-storage[^"]*)"/g)) ids.add(match[1]);
    for (const id of ids) console.log(id);
    console.log('--- turbo module registry path present:', body.includes('TurboModuleRegistry'));
  });
}).on('error', error => console.log('FAILED', error.message));
