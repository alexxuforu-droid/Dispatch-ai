// What the missing-states review found, fixed where it is cheap and honest.
//
// - The top bar said "Provider not set" before the check had even run, so the app told you
//   something it did not know. It says it is checking until it knows.
// - The artifact path was plain text you could not select, so you could not copy it.
// - The composer's "Browse files" did not browse files: it went to the settings, where the
//   project files live. It now says what it opens.
// - The senior agent auto-approval toggle did not say that it lets a model write to disk.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

// ---- the top bar stops claiming to know before it knows ---------------------------------
swap('App.tsx',
  "  const [providerReady, setProviderReady] = useState(false);",
  "  const [providerReady, setProviderReady] = useState(false);\n  const [providerChecked, setProviderChecked] = useState(false);");
swap('App.tsx',
  "      if (active) setProviderReady(hasSecret && !!profile.model.trim());\n    }).catch(() => { if (active) setProviderReady(false); });",
  "      if (active) { setProviderReady(hasSecret && !!profile.model.trim()); setProviderChecked(true); }\n    }).catch(() => { if (active) { setProviderReady(false); setProviderChecked(true); } });");
swap('App.tsx',
  "<Topbar title={pageTitles[screen]} connected={providerReady}",
  "<Topbar title={pageTitles[screen]} status={providerChecked ? (providerReady ? 'Provider configured' : 'Provider not set') : 'Checking the provider…'}");
swap('App.tsx',
  "function Topbar({ title, connected, busy, cancelRequested, onCancel }: { title: string; connected: boolean; busy: boolean; cancelRequested: boolean; onCancel: () => void }) {",
  "function Topbar({ title, status, busy, cancelRequested, onCancel }: { title: string; status: string; busy: boolean; cancelRequested: boolean; onCancel: () => void }) {");
swap('App.tsx',
  "<Text style={styles.statusText}>{connected ? 'Provider configured' : 'Provider not set'}</Text>",
  "<Text style={styles.statusText}>{status}</Text>");

// ---- the artifact path can be copied --------------------------------------------------------
swap('App.tsx',
  "<Text style={styles.artifactRunMeta}>",
  "<Text selectable style={styles.artifactRunMeta}>");

// ---- the button says what it opens -------------------------------------------------------------
swap('App.tsx',
  '>Browse files<',
  '>Project files<');

// ---- the toggle says what it allows ------------------------------------------------------------
swap('App.tsx',
  'detail="Let a qualified higher-ranked reviewer apply passed code changes; otherwise you apply them"',
  'detail="Let a qualified higher-ranked reviewer apply passed code changes, which writes to your project. Otherwise you apply them yourself."');

console.log('the missing states review findings are fixed');
