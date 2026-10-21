// Replace the DispatchHome component with the redesigned one, and pull the Button import in.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');
const replacement = fs.readFileSync('.scratch/native-ui-mastery/dispatch-home.tsx', 'utf8');

const start = text.indexOf('function DispatchHome(');
const end = text.indexOf('function RunConversation(');
if (start < 0 || end < 0) { console.log('MISS: component bounds'); process.exit(1); }
text = text.slice(0, start) + replacement + text.slice(end);

if (!text.includes("from './src/ui'")) {
  text = text.replace("import { Reveal, FocusPressable } from './src/Reveal';", "import { Reveal, FocusPressable } from './src/Reveal';\nimport { Button, Toast, ToastSlot } from './src/ui';");
}

// The notice is a toast now, not a banner over the content.
if (!text.includes('<ToastSlot>')) {
  text = text.replace(
    '      </View>\n    </View>\n    <TeamPicker',
    '      </View>\n    </View>\n    <ToastSlot>{notice ? <Toast title={notice} onDismiss={() => setNotice(\'\')} /> : null}</ToastSlot>\n    <TeamPicker',
  );
}

fs.writeFileSync(file, text, 'utf8');
console.log('DispatchHome replaced');
