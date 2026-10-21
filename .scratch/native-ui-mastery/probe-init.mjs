// Which of the initialization modules are actually in the Windows bundle?
import http from 'node:http';

const needles = [
  'Libraries/Core/InitializeCore',
  'Libraries/ReactPrivate/ReactNativePrivateInitializeCore',
  'Libraries/Renderer/implementations/ReactFabric-dev',
  'Libraries/Core/setUpBatchedBridge',
  'Libraries/Core/setUpGlobals',
  'Libraries/ReactNative/RendererProxy',
  'Libraries/Utilities/Platform',
];

http.get('http://localhost:8081/index.bundle?platform=windows&dev=true&hot=true&inlineSourceMap=true', res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    for (const needle of needles) {
      const at = body.indexOf(needle);
      console.log(`${at < 0 ? 'MISSING' : 'present'}  ${needle}`);
    }
    const at = body.indexOf('Libraries/Renderer/implementations/ReactFabric-dev');
    if (at > 0) {
      console.log('\n--- ReactFabric-dev module head');
      console.log(body.slice(Math.max(0, at - 900), at + 200).replace(/\n/g, ' | '));
    }
  });
}).on('error', error => console.log('FAILED', error.message));
