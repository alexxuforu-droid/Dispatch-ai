// The starting-point presets were a horizontal scroller inside a 220 pixel rail, so each
// chip was clipped mid-word and the scroller stretched the chips to the height of the
// rail. They are a small set, so they wrap into a grid instead.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text, 'utf8');
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

swap('src/DesignStudio.tsx',
  '<ScrollView horizontal contentContainerStyle={s.presetRow} showsHorizontalScrollIndicator={false}>{presets.map(preset =>',
  '<View style={s.presetRow}>{presets.map(preset =>');

swap('src/DesignStudio.tsx',
  '<Text style={s.presetOutput}>{preset.output}</Text></FocusPressable>)}</ScrollView>',
  '<Text style={s.presetOutput}>{preset.output}</Text></FocusPressable>)}</View>');

swap('src/DesignStudio.tsx',
  "presetRow: { gap: 7, paddingBottom: 14 },",
  "presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 14 },");

swap('src/DesignStudio.tsx',
  "preset: { minWidth: 115, minHeight: 57,",
  "preset: { width: 90, minHeight: 57,");

console.log('the preset shelf wraps instead of scrolling');
