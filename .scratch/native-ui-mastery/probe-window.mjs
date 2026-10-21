// Hermes reports a bare, unguarded 'window' as "Property 'window' doesn't exist". Find the
// bare identifier uses in the bundle, with context.
import http from 'node:http';

http.get('http://localhost:8081/index.bundle?platform=windows&dev=true&hot=true&inlineSourceMap=true', res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    const lines = body.split('\n');
    const seen = new Set();
    lines.forEach((line, index) => {
      // A bare identifier: not preceded by a dot and not a member access.
      const match = /(^|[^.\w$'"`])window(?![\w$:.])/.exec(line);
      if (!match) return;
      if (/typeof window|typeof\s+window/.test(line)) return;
      const key = line.trim().slice(0, 70);
      if (seen.has(key)) return;
      seen.add(key);
      console.log(`${index + 1}: ${line.trim().slice(0, 160)}`);
    });
  });
}).on('error', error => console.log('FAILED', error.message));
