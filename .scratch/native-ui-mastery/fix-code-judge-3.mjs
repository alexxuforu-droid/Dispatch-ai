// The rest of the code judge's second round.
//
// - The team tab is borderless too, so the focus ring landed on the same fill as its
//   selected state. It carries a transparent border now, like the nav item.
// - The orphan whitespace line in RunWorkspace.
// - The doc comment on the focus ring, which still described the old contract.
// - The scratch script that could write the string "utf8" over a source file.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};

// ---- the team tab ------------------------------------------------------------------------
const app = 'App.tsx';
let text = read(app);
const teamTab = /teamTab: \{([^}]*)\}/.exec(text);
if (!teamTab) { console.log('MISS teamTab'); }
else if (teamTab[1].includes('borderWidth')) { console.log('the team tab already has a border'); }
else {
  text = text.replace(teamTab[0], `teamTab: { borderWidth: 1, borderColor: 'transparent',${teamTab[1]}}`);
  write(app, text);
  console.log('the team tab carries a border for the focus ring');
}

// ---- the orphan line -----------------------------------------------------------------------
const workspace = 'src/RunWorkspace.tsx';
const lines = read(workspace).split('\n');
const index = lines.findIndex(line => /^\s+$/.test(line));
if (index >= 0) {
  lines.splice(index, 1);
  write(workspace, lines.join('\n'));
  console.log('the orphan line is gone');
} else {
  console.log('no orphan line found');
}

// ---- the doc comment ------------------------------------------------------------------------
const reveal = 'src/Reveal.tsx';
let ring = read(reveal);
const oldComment = ` * The colour is picked from the control's own fill, so a filled accent button (a mint
 * background) gets a lighter mint and a dark surface gets the raised tone.`;
const newComment = ` * The colour is picked from the control's own fill: the ink on the lead block, the
 * page colour on a light fill, and the lead colour on a dark surface. A control that
 * carries a border has its border recoloured, which costs no reflow; one that does not
 * is given a transparent border to recolour.`;
if (!ring.includes(oldComment)) { console.log('MISS the ring comment'); }
else {
  ring = ring.replace(oldComment, newComment);
  write(reveal, ring);
  console.log('the ring comment matches the code again');
}

// ---- the landmine ------------------------------------------------------------------------------
const script = '.scratch/native-ui-mastery/studio-presets.mjs';
let landmine = read(script);
const bad = "const write = (file, text) => fs.writeFileSync(file, 'utf8');";
if (landmine.includes(bad)) {
  landmine = landmine.replace(bad, "const write = (file, text) => fs.writeFileSync(file, text, 'utf8');");
  write(script, landmine);
  console.log('the scratch script can no longer overwrite a source file');
} else {
  console.log('the scratch script is already safe');
}
