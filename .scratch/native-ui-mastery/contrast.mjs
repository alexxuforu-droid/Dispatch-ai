// Contrast ratios for the proposed palette, so the plan states measured numbers.
const pairs = [
  ['ink', '#F2F4F6', 'surface', '#14171B'],
  ['ink', '#F2F4F6', 'canvas', '#0F1114'],
  ['inkSecondary', '#B9C0C9', 'surface', '#14171B'],
  ['inkMuted', '#8A929C', 'surface', '#14171B'],
  ['inkMuted', '#8A929C', 'canvas', '#0F1114'],
  ['accent', '#86E0C8', 'surface', '#14171B'],
  ['accentInk', '#0B1512', 'accent', '#86E0C8'],
  ['accent', '#86E0C8', 'accentSubtle', '#123028'],
  ['danger', '#F18D92', 'dangerSubtle', '#2A1618'],
  ['warning', '#E9BD79', 'warningSubtle', '#241C10'],
  ['borderStrong', '#2F363F', 'surface', '#14171B'],
];

const luminance = hex => {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

for (const [nameA, a, nameB, b] of pairs) {
  const first = luminance(a);
  const second = luminance(b);
  const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  console.log(`${nameA} on ${nameB}: ${ratio.toFixed(2)}:1`);
}
