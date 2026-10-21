// The last hand rolled toggle: the agent tool permission switch.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');
const from = '<AgentToolToggle label="Edit" detail="Stage exact edits to existing files" value={permissions.edit} onChange={value => setAgentPermission(role.id, \'edit\', value)} />';
const to = '<Toggle label="Edit" detail="Stage exact edits to existing files" value={permissions.edit} onChange={value => setAgentPermission(role.id, \'edit\', value)} />';
if (!text.includes(from)) { console.log('MISS'); process.exit(1); }
text = text.replace(from, to);
fs.writeFileSync(file, text, 'utf8');
console.log('last toggle converted');
