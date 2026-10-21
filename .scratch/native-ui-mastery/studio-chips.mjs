// The studio's selected chips and the icon square behind a recipe were tinted blocks. A
// selected chip is a quiet surface; the icon square was decoration around an icon.
import fs from 'node:fs';

const file = 'src/DesignStudio.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

swap("presetActive: { borderColor: colors.line, backgroundColor: colors.support }", "presetActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive }");
swap("outputChoiceActive: { backgroundColor: colors.support, borderColor: colors.line }", "outputChoiceActive: { backgroundColor: colors.surfaceActive, borderColor: colors.textMuted }");
swap("recipeIcon: { width: 27, height: 27, borderRadius: 7, backgroundColor: colors.support, justifyContent: 'center', alignItems: 'center' }, recipeIconText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }", "recipeIconText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }");
swap("<View style={s.recipeIcon}><Text style={s.recipeIconText}>3D</Text></View>", "<Text style={s.recipeIconText}>3D</Text>");

fs.writeFileSync(file, text, 'utf8');
console.log('studio chips quieted');
