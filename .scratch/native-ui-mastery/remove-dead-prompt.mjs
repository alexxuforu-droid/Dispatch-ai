// Two more things the reviews turned up: the component that only the removed starter chips
// used, and the labels still written in capitals.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

// The starter chips are gone, and the component that only they used goes with them.
const prompt = `function Prompt({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return <FocusPressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}><Text style={styles.promptText}>{children}</Text></FocusPressable>;
}

`;
if (!text.includes(prompt)) { console.log('MISS the Prompt component'); }
else text = text.replace(prompt, '');

// Labels written in capitals.
text = text.replace('>COMPLETE FILE BEFORE THIS CHANGE<', '>The file before this change<');
text = text.replace('>COMPLETE FILE AFTER THIS CHANGE<', '>The file after this change<');

fs.writeFileSync(file, text, 'utf8');
console.log('the dead component is gone and the capitals are words');
