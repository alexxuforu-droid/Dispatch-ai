// Bundle facts: module wrappers, source map comments, and where a bare `window` shows up.
import http from 'node:http';

http.get('http://localhost:8081/index.bundle?platform=windows&dev=true&hot=true&inlineSourceMap=true', res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    const count = pattern => (body.match(pattern) ?? []).length;
    console.log('length', body.length);
    console.log('sourceURL comments', count(/sourceURL=/g));
    console.log('sourceMappingURL comments', count(/sourceMappingURL/g));
    console.log('__d wrappers', count(/__d\(/g));
    console.log('mentions useWindowDimensions', body.includes('useWindowDimensions'));
    console.log('mentions CompatNativeSafeAreaProvider', body.includes('CompatNativeSafeAreaProvider'));
    for (const needle of ['useWindowDimensions', 'CompatNativeSafeAreaProvider']) {
      const at = body.indexOf(needle);
      if (at < 0) continue;
      console.log(`\n--- first ${needle} at ${at}`);
      console.log(body.slice(Math.max(0, at - 500), at + 500).replace(/\n/g, ' | '));
    }
  });
}).on('error', error => console.log('FAILED', error.message));
