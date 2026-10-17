// Headless rasterizer: renders a react-test-renderer JSON tree (real components, real
// style props) to a PNG so the UI can be reviewed with vision without launching a window.
// This is an approximation of the Windows compositor, not it: flexbox is a subset, text
// metrics are estimated. It is honest about layout, colour, hierarchy, density and copy,
// which is what a design review reads. It is not a substitute for a device screenshot.
//
// usage: node scripts/render-snapshot.mjs <tree.json> <out.png> [width] [height]

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve, basename } from 'path';
import { Resvg } from '@resvg/resvg-js';

const treePath = process.argv[2];
const outPath = process.argv[3];
const VIEW_W = Number(process.argv[4] ?? 1440);
const VIEW_H = Number(process.argv[5] ?? 900);
const TREE_DIR = dirname(resolve(treePath));

const FONT_STACK = "'Segoe UI Variable Text','Segoe UI',sans-serif";

function flatten(style) {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce((acc, s) => Object.assign(acc, flatten(s)), {});
  return style;
}

const px = (v) => (typeof v === 'number' ? v : undefined);
const width0 = (cap, fallback) => (cap > 0 ? cap : fallback);
// This app leans on percentage widths (35 of them). Resolving them against the parent's
// content box is what makes a 320px capture mean anything.
function resolveLength(value, basis) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const percent = Number(value.trim().slice(0, -1));
    if (Number.isFinite(percent)) return (percent / 100) * basis;
  }
  return undefined;
}
function edges(style, kind) {
  const all = px(style[kind]);
  const horiz = px(style[`${kind}Horizontal`]);
  const vert = px(style[`${kind}Vertical`]);
  const top = px(style[`${kind}Top`]) ?? vert ?? all ?? 0;
  const bottom = px(style[`${kind}Bottom`]) ?? vert ?? all ?? 0;
  const left = px(style[`${kind}Left`]) ?? horiz ?? all ?? 0;
  const right = px(style[`${kind}Right`]) ?? horiz ?? all ?? 0;
  return { top, bottom, left, right };
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

// Approximate width of a string at a given font size.
function textWidth(text, fontSize, weight) {
  const bold = typeof weight === 'string' ? /bold|[6-9]00/.test(weight) : weight >= 600;
  return String(text).length * fontSize * (bold ? 0.56 : 0.52);
}

function measure(node, availW, intrinsic = false) {
  const style = flatten(node.props?.style);
  const isText = node.type === 'Text';
  const pad = edges(style, 'padding');
  const margin = edges(style, 'margin');
  const innerW = Math.max(0, availW - pad.left - pad.right - margin.left - margin.right);

  if (isText) {
    const fontSize = px(style.fontSize) ?? 14;
    const lineHeight = px(style.lineHeight) ?? fontSize * 1.35;
    const lines = wrap(textOf(node.children), innerW, fontSize, style.fontWeight);
    const height = px(style.height) ?? lines.length * lineHeight;
    // A text node occupies the width its longest line actually needs, not the full
    // cross-axis. Giving it innerW made every text sibling in a row overflow.
    const natural = Math.max(...lines.map(line => textWidth(line, fontSize, style.fontWeight)), 0);
    const width = resolveLength(style.width, innerW) ?? Math.min(innerW, natural);
    return { width: width + margin.left + margin.right, height: height + margin.top + margin.bottom + pad.top + pad.bottom };
  }

  const explicitW = resolveLength(style.width, innerW);
  const explicitH = resolveLength(style.height, innerW);
  const row = style.flexDirection === 'row';
  const children = (node.children ?? []).filter(child => typeof child !== 'string');
  const gap = px(style.gap) ?? 0;

  let contentW = 0;
  let contentH = 0;

  if (row) {
    // Fixed-basis children claim their width first; flex children share what is left.
    // flexBasis is the base width a growable child starts from, so it must count as fixed.
    let fixedTotal = 0;
    let flexTotal = 0;
    for (const child of children) {
      const cs = flatten(child.props?.style);
      const cm = edges(cs, 'margin');
      const w = resolveLength(cs.flexBasis, innerW) ?? resolveLength(cs.width, innerW);
      if (w !== undefined) fixedTotal += w + cm.left + cm.right;
      const fv = px(cs.flex) ?? px(cs.flexGrow) ?? 0;
      if (fv > 0 && w === undefined) flexTotal += fv;
    }
    const gaps = gap * Math.max(0, children.length - 1);
    const remaining = Math.max(0, innerW - fixedTotal - gaps);
    let cursor = 0;
    for (const child of children) {
      const cs = flatten(child.props?.style);
      const cm = edges(cs, 'margin');
      const w = resolveLength(cs.flexBasis, innerW) ?? resolveLength(cs.width, innerW);
      const fv = px(cs.flex) ?? px(cs.flexGrow) ?? 0;
      const budget = w ?? (flexTotal > 0 ? (remaining * fv) / flexTotal : remaining);
      const childM = measure(child, budget - cm.left - cm.right);
      cursor += childM.width;
      contentW = Math.max(contentW, cursor);
      contentH = Math.max(contentH, childM.height);
    }
  } else {
    for (const child of children) {
      const childM = measure(child, innerW);
      contentW = Math.max(contentW, childM.width);
      contentH += childM.height;
    }
    contentH += gap * Math.max(0, children.length - 1);
  }

  // React Native's default alignItems is stretch, so a column child fills the cross axis.
  // `intrinsic` is the exception: a sibling with no flex and no width takes only the space
  // its content needs. Handing it the whole remaining row squeezed buttons to nothing.
  const maxWidth = resolveLength(style.maxWidth, innerW);
  const capped = maxWidth !== undefined ? Math.min(width0(maxWidth, innerW), innerW) : innerW;
  const width = explicitW ?? (row ? Math.max(contentW, capped) : (intrinsic ? Math.min(contentW, capped) : capped));
  const height = explicitH ?? px(style.minHeight) ?? (contentH + pad.top + pad.bottom);
  return { width: width + margin.left + margin.right, height: height + margin.top + margin.bottom };
}

function render(node, x, y, availW, out, stretchH, stretchW) {
  if (!node || typeof node === 'string') return;
  const style = flatten(node.props?.style);
  const isText = node.type === 'Text';
  const pad = edges(style, 'padding');
  const margin = edges(style, 'margin');
  const m = measure(node, availW);
  const w = stretchW ?? (m.width - margin.left - margin.right);
  const h = stretchH ?? (m.height - margin.top - margin.bottom);
  const left = x + margin.left;
  const top = y + margin.top;

  if (!isText && style.backgroundColor) {
    out.push(`<rect x="${r(left)}" y="${r(top)}" width="${r(w)}" height="${r(h)}" fill="${style.backgroundColor}"/>`);
  }
  const bw = px(style.borderWidth) ?? px(style.borderTopWidth) ?? px(style.borderLeftWidth) ?? px(style.borderRightWidth);
  if (bw) {
    const bc = style.borderColor ?? style.borderTopColor ?? style.borderLeftColor ?? '#000';
    const sides = [];
    if (px(style.borderWidth) || px(style.borderTopWidth)) sides.push(`M ${r(left)} ${r(top + h)} L ${r(left)} ${r(top)} L ${r(left + w)} ${r(top)}`);
    if (px(style.borderWidth) || px(style.borderRightWidth)) sides.push(`M ${r(left + w)} ${r(top)} L ${r(left + w)} ${r(top + h)}`);
    if (px(style.borderWidth) || px(style.borderBottomWidth)) sides.push(`M ${r(left + w)} ${r(top + h)} L ${r(left)} ${r(top + h)}`);
    if (px(style.borderWidth) || px(style.borderLeftWidth)) sides.push(`M ${r(left)} ${r(top + h)} L ${r(left)} ${r(top)}`);
    out.push(`<path d="${sides.join(' ')}" fill="none" stroke="${bc}" stroke-width="${bw}"/>`);
  }

  const contentX = left + pad.left;
  const contentY = top + pad.top;
  const contentW = Math.max(0, w - pad.left - pad.right);
  const contentH = Math.max(0, h - pad.top - pad.bottom);

  if (isText) {
    const fontSize = px(style.fontSize) ?? 14;
    const lineHeight = px(style.lineHeight) ?? fontSize * 1.35;
    const color = style.color ?? '#F1F1F2';
    const lines = wrap(textOf(node.children), contentW, fontSize, style.fontWeight);
    const anchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
    const tx = style.textAlign === 'center' ? contentX + contentW / 2 : style.textAlign === 'right' ? contentX + contentW : contentX;
    lines.forEach((lineText, i) => {
      const weightAttr = style.fontWeight ? ` font-weight="${style.fontWeight}"` : '';
      out.push(`<text x="${r(tx)}" y="${r(contentY + fontSize + i * lineHeight)}" fill="${color}" font-family="${FONT_STACK}" font-size="${r(fontSize)}"${weightAttr} text-anchor="${anchor}">${esc(lineText)}</text>`);
    });
    return;
  }

  if (node.type === 'Image') {
    const file = drawImageRef(node);
    const iw = resolveLength(style.width, contentW) ?? 24;
    const ih = px(style.height) ?? 24;
    if (file) {
      out.push(`<image href="${dataUri(file)}" x="${r(contentX)}" y="${r(contentY)}" width="${r(iw)}" height="${r(ih)}" preserveAspectRatio="xMidYMid meet"/>`);
    } else {
      out.push(`<rect x="${r(contentX)}" y="${r(contentY)}" width="${r(iw)}" height="${r(ih)}" fill="#2C313A"/>`);
    }
    return;
  }

  const row = style.flexDirection === 'row';
  const gap = px(style.gap) ?? 0;
  const justify = style.justifyContent ?? 'flex-start';
  const align = style.alignItems ?? 'stretch';
  const all = (node.children ?? []).filter(child => typeof child !== 'string');
  const children = all.filter(child => flatten(child.props?.style).position !== 'absolute');
  const absolutes = all.filter(child => flatten(child.props?.style).position === 'absolute');

  // Absolutely positioned children paint over the parent and take no flow space.
  for (const child of absolutes) {
    const cs = flatten(child.props?.style);
    const cm = edges(cs, 'margin');
    render(child, left + (px(cs.left) ?? 0) - cm.left, top + (px(cs.top) ?? 0) - cm.top, px(cs.width) ?? contentW, out, px(cs.height));
  }

  if (row) {
    let fixedTotal = 0;
    let flexTotal = 0;
    for (const child of children) {
      const cs = flatten(child.props?.style);
      const cm = edges(cs, 'margin');
      const w = resolveLength(cs.flexBasis, contentW) ?? resolveLength(cs.width, contentW);
      if (w !== undefined) fixedTotal += w + cm.left + cm.right;
      const fv = px(cs.flex) ?? px(cs.flexGrow) ?? 0;
      if (fv > 0 && w === undefined) flexTotal += fv;
    }
    const gaps = gap * Math.max(0, children.length - 1);
    const remaining = Math.max(0, contentW - fixedTotal - gaps);
    const placements = children.map(child => {
      const cs = flatten(child.props?.style);
      const cm = edges(cs, 'margin');
      const w = resolveLength(cs.flexBasis, contentW) ?? resolveLength(cs.width, contentW);
      const fv = px(cs.flex) ?? px(cs.flexGrow) ?? 0;
      const budget = w ?? (fv > 0 ? (flexTotal > 0 ? (remaining * fv) / flexTotal : remaining) : remaining);
      // No width and no flex means this sibling sizes to its own content, not to the row.
      const sized = measure(child, budget - cm.left - cm.right, w === undefined && fv <= 0);
      return { child, cs, cm, w, fv, budget, width: sized.width };
    });
    const used = placements.reduce((sum, p) => sum + p.width, 0) + gaps;
    // space-between distributes slack. When children already overflow, slack is negative
    // and subtracting it would drag the right-hand child backwards on top of the left one.
    const slack = Math.max(0, contentW - used);
    let cursor = contentX;
    let extraGap = 0;
    if (justify === 'center') cursor += slack / 2;
    else if (justify === 'flex-end') cursor += slack;
    else if (justify === 'space-between' && placements.length > 1) extraGap = slack / (placements.length - 1);
    else if (justify === 'space-around' && placements.length) { cursor += slack / (placements.length * 2); extraGap = slack / placements.length; }
    else if (justify === 'space-evenly' && placements.length) { cursor += slack / (placements.length + 1); extraGap = slack / (placements.length + 1); }

    const wrap = style.flexWrap === 'wrap';
    let lineX = contentX;
    let lineY = contentY;
    placements.forEach((p) => {
      if (wrap && lineX > contentX && lineX + p.width > contentX + contentW) {
        lineX = contentX;
        lineY += contentH + gap;
      }
      const stretch = p.w === undefined && p.fv > 0 ? contentH : undefined;
      const childH = align === 'stretch' || p.fv > 0 ? contentH : undefined;
      // Carry the intrinsic width into the draw step, otherwise the child re-measures at the
      // full remaining width and the button balloons back out.
      const fixedW = p.w === undefined && p.fv <= 0 ? p.width : undefined;
      render(p.child, wrap ? lineX : cursor, wrap ? lineY : contentY + (align === 'center' ? Math.max(0, (contentH - measure(p.child, p.budget).height) / 2) : 0), p.budget, out, stretch ?? childH, fixedW);
      lineX += p.width + gap;
      cursor += p.width + gap + extraGap;
    });
  } else {
    let cursor = contentY;
    for (const child of children) {
      const cs = flatten(child.props?.style);
      const cap = resolveLength(cs.maxWidth, contentW);
      const childAvail = cap !== undefined ? Math.min(contentW, cap) : contentW;
      const childM = measure(child, childAvail);
      let childX = contentX;
      let stretchW;
      if (align === 'center') childX = contentX + (contentW - childM.width) / 2;
      else if (align === 'flex-end') childX = contentX + (contentW - childM.width);
      else if (align !== 'stretch') stretchW = childM.width;
      // alignSelf on the child wins over the parent's alignItems, and pins it in place.
      if (cs.alignSelf === 'center') { childX = contentX + (contentW - childM.width) / 2; stretchW = undefined; }
      else if (cs.alignSelf === 'flex-end') { childX = contentX + (contentW - childM.width); stretchW = undefined; }
      else if (typeof cs.alignSelf === 'number') { childX = contentX + cs.alignSelf; stretchW = undefined; }
      render(child, childX, cursor, childAvail, out, undefined, stretchW);
      cursor += childM.height + gap;
    }
  }
}

function wrap(text, maxW, fontSize, weight) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (textWidth(candidate, fontSize, weight) <= maxW) line = candidate;
    else { lines.push(line); line = word; }
  }
  lines.push(line);
  return lines;
}

function findAsset(uri) {
  const direct = resolve(TREE_DIR, uri);
  if (existsSync(direct)) return direct;
  // Metro's testUri is a hint resolved against the requiring source file, which no longer
  // exists relative to a snapshot directory. Fall back to walking up for an assets folder,
  // so brand artwork actually renders instead of a gray placeholder in every capture.
  const name = basename(uri);
  // Snapshots may live on a different drive from the project, so a walk-up cannot reach the
  // assets; PROJECT_ASSETS names the folder explicitly.
  if (process.env.PROJECT_ASSETS) {
    const named = resolve(process.env.PROJECT_ASSETS, name);
    if (existsSync(named)) return named;
  }
  let dir = TREE_DIR;
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = resolve(dir, 'assets', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function drawImageRef(node) {
  const uri = node.props?.source?.testUri;
  if (!uri) return null;
  return findAsset(uri);
}

function r(n) { return Math.round(n * 100) / 100; }

function dataUri(file) {
  const ext = file.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/svg+xml';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

const tree = JSON.parse(readFileSync(treePath, 'utf8'));
const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${VIEW_W} ${VIEW_H}">`,
  `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#0B0D10"/>`,
];
render(tree, 0, 0, VIEW_W, parts);
parts.push('</svg>');

const svg = parts.join('\n');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: VIEW_W },
  font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
});
const png = resvg.render().asPng();
const { writeFileSync } = await import('fs');
writeFileSync(outPath, png);
console.log(`${basename(outPath)} written (${png.length} bytes) from ${basename(treePath)}`);
