// Oxfords slop check for React Native source.
//
// The oxfords checker (scripts/check.mjs in the oxfords skill) is written for web CSS and
// Tailwind, so it reads a React Native stylesheet almost blind: it catches em dashes and
// buzzwords, but not an uppercase eyebrow, a tinted status pill, an accent rail or a raw
// hex value. This script adds the React Native equivalents of the same slop floor and
// runs the oxfords checker alongside it, so one command covers the app.
//
//   node scripts/check-rn.mjs [paths] [--strict]
//
// Fails on the mechanical tells, warns on the judgement ones. Exits 1 when a rule fails.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const roots = args.filter(argument => !argument.startsWith('--'));
if (roots.length === 0) roots.push('App.tsx', 'src');

const TOKEN_FILE = 'src/theme.ts';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.scratch']);
const findings = [];

const fail = (file, line, id, message) => findings.push({ level: 'FAIL', file, line, id, message });
const warn = (file, line, id, message) => findings.push({ level: 'WARN', file, line, id, message });

function walk(path, files = []) {
  if (!existsSync(path)) return files;
  const stats = statSync(path);
  if (stats.isFile()) {
    if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(path))) files.push(path);
    return files;
  }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) continue;
    walk(join(path, entry), files);
  }
  return files;
}

const files = roots.flatMap(root => walk(root));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// The oxfords buzzword list, kept in step with the skill's own checker.
const BUZZ = ['seamless', 'effortless', 'unlock', 'unleash', 'elevate', 'supercharge', 'empower',
  'streamline', 'revolutionise', 'revolutionize', 'reimagine', 'next-generation', 'world-class',
  'cutting-edge', 'game-changing', 'all-in-one', 'at your fingertips', 'level up'];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const isTokenFile = file.replace(/\\/g, '/').endsWith(TOKEN_FILE);

  // Slop floor: a raw hex value outside the token file. One palette, one place.
  if (!isTokenFile) {
    for (const match of text.matchAll(/#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{4}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{8}(?![0-9A-Fa-f])/g)) {
      fail(file, lineOf(text, match.index), 'raw-hex',
        'colour literal outside src/theme.ts; the palette lives in the token file');
    }
  }

  // Slop floor: a colour written as a string. "colors.support" is a string, so the
  // fill silently disappears and the state looks unselected.
  if (!isTokenFile) {
    for (const match of text.matchAll(/['"]colors\.[A-Za-z]+['"]/g)) {
      fail(file, lineOf(text, match.index), 'quoted-colour',
        'a colour token name in quotes is a string, not a colour');
    }
  }

  // Slop floor: nothing under 11px.
  for (const match of text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
    if (Number(match[1]) < 11) {
      fail(file, lineOf(text, match.index), 'tiny-text',
        `text under 11px (${match[1]})`);
    }
  }

  // Slop floor: a coloured bar down the side of an element.
  for (const match of text.matchAll(/borderLeft(?:Width|Color)[\s\S]{0,80}?/g)) {
    const block = match[0];
    const width = /borderLeftWidth:\s*(\d+)/.exec(block);
    if (width && Number(width[1]) >= 2 && /color/.test(block)) {
      fail(file, lineOf(text, match.index), 'accent-rail',
        'coloured bar on the edge of an element; use a full-row fill or nothing');
    }
  }

  // Slop floor: the lead colour belongs on content, not on controls. A control is a small
  // filled thing (a button, a chip, a pill); a block is a surface that carries content.
  for (const match of text.matchAll(/(?:^|[,{])\s*(\w+):\s*\{[^}]*backgroundColor:\s*colors\.(?:accent|lead)\b[^}]*\}/g)) {
    const block = match[0];
    const size = /(?:minHeight|height):\s*(\d+)/.exec(block);
    const isControl = size ? Number(size[1]) <= 48 : false;
    if (isControl) {
      fail(file, lineOf(text, match.index), 'accent-fill',
        'lead colour fills a control; chrome and controls stay neutral');
    } else {
      warn(file, lineOf(text, match.index), 'lead-block',
        'lead colour fills a block; one such block per screen, and only on content');
    }
  }
  for (const match of text.matchAll(/backgroundColor:\s*colors\.(?:accentSubtle|support)\b/g)) {
    warn(file, lineOf(text, match.index), 'tinted-pill',
      'tinted surface on a small element; a chip is quiet unless the state needs attention');
  }
  // Slop floor: a bright lead colour is a fill or a large figure, never small text.
  for (const match of text.matchAll(/color:\s*colors\.(?:accent|lead)\b/g)) {
    warn(file, lineOf(text, match.index), 'lead-text',
      'lead colour used as text; the lead is a fill or a large figure');
  }

  // Slop floor: an uppercase, letter-spaced label above a heading.
  for (const match of text.matchAll(/letterSpacing:\s*(0?\.[0-9]+|[1-9][0-9]*)/g)) {
    if (Number(match[1]) >= 0.8) {
      warn(file, lineOf(text, match.index), 'eyebrow',
        'letter-spaced label; drop it unless it carries information');
    }
  }

  // Slop floor: a decorative status dot.
  for (const match of text.matchAll(/(dot|pip|indicator)[A-Za-z]*:\s*\{[^}]*?\}/gi)) {
    const block = match[0];
    const size = /width:\s*(\d+)/.exec(block);
    const radius = /borderRadius:\s*(\d+)/.exec(block);
    const fill = /backgroundColor:\s*'?(#[0-9A-Fa-f]{3,8}|colors\.[a-zA-Z]+)/.exec(block);
    if (size && radius && fill && Number(size[1]) <= 12) {
      warn(file, lineOf(text, match.index), 'status-dot',
        'status dot next to a word; the word is the signal, the dot is decoration');
    }
  }

  // Copy: marketing filler.
  for (const match of text.matchAll(new RegExp(`(?<![\\w-])(?:${BUZZ.join('|')})(?![\\w-])`, 'gi'))) {
    warn(file, lineOf(text, match.index), 'buzzword', 'marketing filler; say what it does');
  }
}

// Icons drawn from View primitives are not an icon set.
for (const file of files) {
  const name = file.replace(/\\/g, '/');
  if (!/Icon(s)?\.tsx$/.test(name)) continue;
  const text = readFileSync(file, 'utf8');
  const primitive = (text.match(/backgroundColor:/g) ?? []).length;
  if (primitive >= 3 && !/react-native-svg/.test(text)) {
    fail(file, 1, 'drawn-icon',
      'icon built from View primitives; vendor an icon set as SVG instead');
  }
}

const grouped = new Map();
for (const finding of findings) {
  const key = `${finding.level}|${finding.id}|${finding.file}`;
  if (!grouped.has(key)) grouped.set(key, { ...finding, count: 0, lines: [] });
  const entry = grouped.get(key);
  entry.count += 1;
  if (entry.lines.length < 6) entry.lines.push(finding.line);
}

for (const entry of grouped.values()) {
  const where = entry.lines.join(', ') + (entry.count > entry.lines.length ? `, +${entry.count - entry.lines.length} more` : '');
  console.log(`${entry.level}  ${entry.id.padEnd(14)} ${entry.file}  (${where})  ${entry.message}`);
}
const failures = findings.filter(finding => finding.level === 'FAIL').length;
const warnings = findings.filter(finding => finding.level === 'WARN').length;
const perRule = new Map();
for (const finding of findings) perRule.set(finding.id, (perRule.get(finding.id) ?? 0) + 1);
console.log('\nby rule: ' + [...perRule.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => `${id} ${count}`).join(', '));
console.log(`${files.length} files, ${failures} fail, ${warnings} warn`);

// The oxfords checker runs too, so the web-oriented rules stay in the loop.
const oxfords = join(process.env.USERPROFILE ?? '', '.agents', 'skills', 'oxfords', 'scripts', 'check.mjs');
if (existsSync(oxfords)) {
  console.log('\noxfords checker:');
  const run = spawnSync(process.execPath, [oxfords, ...roots], { encoding: 'utf8' });
  process.stdout.write(run.stdout ?? '');
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0 && failures === 0) process.exit(run.status ?? 1);
}

if (failures > 0 || (strict && warnings > 0)) process.exit(1);
