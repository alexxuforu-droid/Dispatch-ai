// Ask Metro what it serves for the react-native Platform module on Windows, and for the
// react-native-windows one. The app's runtime error is "Cannot read property 'OS' of
// undefined", which is what the core shim (a self-referential import) produces.
import http from 'node:http';

function get(path) {
  return new Promise(resolve => {
    http.get(`http://localhost:8081/${path}?platform=windows&dev=true`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', error => resolve({ status: 0, body: error.message }));
  });
}

for (const path of [
  'react-native/Libraries/Utilities/Platform',
  'react-native-windows/Libraries/Utilities/Platform.windows',
]) {
  const { status, body } = await get(path);
  const head = body.split('\n').filter(line => /supports backwards compatibility|OS: 'windows'|NativePlatformConstantsWin|import Platform/.test(line)).slice(0, 3);
  console.log(`--- ${path} -> ${status}`);
  head.forEach(line => console.log('   ', line.trim().slice(0, 120)));
}
