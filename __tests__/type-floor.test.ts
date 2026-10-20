/**
 * The type floor, enforced.
 *
 * Windows text scaling grows from the base size, so a label set below 10px is unreadable
 * before scaling even starts. The theme documents that floor, so this test holds the
 * stylesheet to it: every font size declared in the app's own UI sources is at least 10.
 *
 * The file is read with the node runtime rather than imported, because the repo has no
 * @types/node: a type-only import would break the type check for the whole project.
 *
 * The repo has no @types/node, so process/__dirname are undeclared to the compiler even
 * though they exist at runtime. Declare only the missing ones, locally: this file is a
 * module (it exports nothing, but the export makes the declarations file-scoped) so it
 * cannot collide with the same declarations in the other node-reading suite.
 */
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

export {};
const ROOTS = [path.join(__dirname, '..', 'App.tsx'), path.join(__dirname, '..', 'src')];
const MIN_FONT_SIZE = 10;

function sourceFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.tsx') || target.endsWith('.ts') ? [target] : [];
  return fs.readdirSync(target, { withFileTypes: true })
    .flatMap((entry: { isFile(): boolean; isDirectory(): boolean; name: string }) => {
      if (!entry.isFile() && !entry.isDirectory()) return [];
      if (entry.isDirectory()) return sourceFiles(path.join(target, entry.name));
      return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [path.join(target, entry.name)] : [];
    });
}

test('no user-facing text is set below the 10px type floor', () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/fontSize: (\d+(?:\.\d+)?)/g)) {
        const size = Number(match[1]);
        if (size < MIN_FONT_SIZE) offenders.push(`${path.basename(file)}: fontSize ${size}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

test('no line is packed tighter than the text it carries', () => {
  // A line height at or below the font size makes wrapped lines touch or clip, which undoes
  // the legibility the floor was for. The floor test only knows about font sizes, so the
  // pairing is held here.
  //
  // The styles live as one declaration per line, so a font size is paired with the first
  // line height that follows it on the same line. This walks the text directly rather than
  // with a lazy pattern, which backtracks badly on these very long style lines.
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const lines: string[] = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line: string, lineNumber: number) => {
        if (!line.includes('lineHeight')) return;
        // One linear pass per line over both declarations, so the order they appear in is
        // the pairing: a font size takes the next line height that follows it.
        let font = Number.NaN;
        for (const match of line.matchAll(/fontSize: (\d+(?:\.\d+)?)|lineHeight: (\d+(?:\.\d+)?)/g)) {
          if (match[1] !== undefined) { font = Number(match[1]); continue; }
          const height = Number(match[2]);
          if (Number.isFinite(font) && height < font) {
            offenders.push(`${path.basename(file)}:${lineNumber + 1}: fontSize ${font} with lineHeight ${height}`);
          }
        }
      });
    }
  }
  expect(offenders).toEqual([]);
});
