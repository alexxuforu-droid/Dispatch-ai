/**
 * The export path out of the app.
 *
 * The native half of this module is a Windows native module, so it cannot be exercised from
 * jest. What can be held is the half that decides whether the native half is ever reached:
 * the refusal that every native-backed call makes when the native module is not there, and
 * the source-path and text rules that stop a malformed export before a dialog opens. A
 * silent failure here would leave the person clicking a button that never saves anything.
 */

const exporter = require('../src/exporter') as typeof import('../src/exporter');

test('a missing native module is refused out loud, never silently', async () => {
  await expect(exporter.saveArtifactAs('C:\\Users\\me\\AppData\\Local\\Dispatch AI\\Artifacts\\shot.png', 'shot.png')).rejects.toThrow(/unavailable/i);
  await expect(exporter.saveChangeAs('const answer = 42;', 'answer.ts')).rejects.toThrow(/unavailable/i);
  await expect(exporter.saveReportAs('# Report', 'report.md')).rejects.toThrow(/unavailable/i);
});

test('the artifact URI the app stores becomes the local path the native module reads', () => {
  expect(exporter.toLocalPath('file:///C:/Users/me/AppData/Local/Dispatch AI/Artifacts/dispatch-run-1.png'))
    .toBe('C:/Users/me/AppData/Local/Dispatch AI/Artifacts/dispatch-run-1.png');
  expect(exporter.toLocalPath('C:\\Users\\me\\shot.png')).toBe('C:\\Users\\me\\shot.png');
});

test('a source path that is not a plain local file is refused', () => {
  expect(() => exporter.toLocalPath('')).toThrow(/no file to export/i);
  expect(() => exporter.toLocalPath('   ')).toThrow(/no file to export/i);
  expect(() => exporter.toLocalPath('shots\\shot.png')).toThrow(/absolute file path/i);
  expect(() => exporter.toLocalPath('\\\\server\\share\\shot.png')).toThrow(/plain local file path/i);
  expect(() => exporter.toLocalPath('C:\\shots\\shot.png:secret')).toThrow(/alternate data streams/i);
  expect(() => exporter.toLocalPath('C:\\shots\\..\\Windows\\shot.png')).toThrow(/parent-directory/i);
  expect(() => exporter.toLocalPath('file:///C:/shots/%zz.png')).toThrow(/malformed/i);
});

test('exported text is not empty, is UTF-8, and stays inside the writer limit', () => {
  expect(exporter.checkedExportText('const answer = 42;')).toBe('const answer = 42;');
  expect(() => exporter.checkedExportText('')).toThrow(/nothing to export/i);
  expect(() => exporter.checkedExportText('\ud800')).toThrow(/UTF-8/i);
  expect(() => exporter.checkedExportText('x'.repeat(1024 * 1024 + 1))).toThrow(/1 MB/i);
});

test('the UTF-8 size of the text is counted in bytes, not characters', () => {
  expect(exporter.utf8ByteLength('abc')).toBe(3);
  expect(exporter.utf8ByteLength('é')).toBe(2);
  expect(exporter.utf8ByteLength('€')).toBe(3);
  expect(exporter.utf8ByteLength('😀')).toBe(4);
});
