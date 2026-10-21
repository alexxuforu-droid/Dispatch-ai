// List every bare `window` occurrence in one bundle module, so code (not comments) is visible.
import http from 'node:http';

const target = process.argv[2] ?? 'react-devtools-core';
const bundleUrl = 'http://localhost:8081/index.bundle?platform=windows&dev=true&hot=true&inlineSourceMap=true';

http.get(bundleUrl, res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    const chunks = body.split('__d(function (global, _$$_REQUIRE');
    for (let index = 1; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (!chunk.includes(target)) continue;
      const pathMatch = /"([^"]+)"\s*\)?\s*;?\s*$/.exec(chunk.trimEnd());
      const source = pathMatch ? pathMatch[1] : 'unknown';
      const lines = chunk.split('\n');
      const hits = lines
        .map((line, at) => ({ at: at + 1, line }))
        .filter(({ line }) => /(^|[^.\w$'"`])window(?![\w$:.])/.test(line) && !/typeof\s+window/.test(line));
      console.log(`\n=== ${source} (${hits.length} bare window hits)`);
      for (const hit of hits.slice(0, 40)) console.log(`  ${hit.at}: ${hit.line.trim().slice(0, 130)}`);
    }
  });
}).on('error', error => console.log('FAILED', error.message));
