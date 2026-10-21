// Which react-native package does the bundle actually pull modules from: the plain
// react-native package (which has no Windows entry point) or react-native-windows?
import http from 'node:http';

http.get('http://localhost:8081/index.bundle?platform=windows&dev=true&hot=true&inlineSourceMap=true', res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    const counts = new Map();
    for (const match of body.matchAll(/node_modules[\\/](react-native-windows|react-native)[\\/]([A-Za-z0-9_.\-\\/]+)/g)) {
      const key = match[1] + ' ' + match[2].split('/').slice(0, 2).join('/');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    for (const [key, count] of top) console.log(String(count).padStart(5), key);
  });
}).on('error', error => console.log('FAILED', error.message));
