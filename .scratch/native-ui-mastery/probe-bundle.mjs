// After the metro mapping, which entry point and Platform module does the Windows bundle use?
import http from 'node:http';

function get(path) {
  return new Promise(resolve => {
    http.get(`http://localhost:8081/${path}`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', error => resolve({ status: 0, body: error.message }));
  });
}

const bundle = await get('index.bundle?platform=windows&dev=true&minify=false');
console.log('bundle status', bundle.status, 'bytes', bundle.body.length);
console.log('mentions index.windows:', bundle.body.includes('index.windows'));
console.log('mentions NativePlatformConstantsWin:', bundle.body.includes('NativePlatformConstantsWin'));
console.log('mentions OS: windows:', bundle.body.includes("OS: 'windows'"));

for (const path of [
  'node_modules/react-native-windows/Libraries/Utilities/Platform.windows.js?platform=windows&dev=true',
  'node_modules/react-native-windows/index.windows.js?platform=windows&dev=true',
]) {
  const { status, body } = await get(path);
  const marker = /NativePlatformConstantsWin|OS: 'windows'|DynamicColorIOS/.exec(body);
  console.log(`--- ${path.split('?')[0]} -> ${status} ${marker ? 'contains ' + marker[0] : ''}`);
}
