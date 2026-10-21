// The last of the letter-spaced labels, the remaining uppercase words, and the styles that
// nothing renders any more.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

// A letter-spaced label above a heading is a mark of a generated interface. The labels that
// remain are status words, so they carry no tracking.
for (const name of ['pluginCategory', 'boardKind', 'boardStatus', 'hierarchyLegendTitle', 'hierarchyRankTitle', 'activeTeamBadge', 'connectionLabel', 'threadKicker', 'collectionPath', 'runCardStatus']) {
  const re = new RegExp(`(${name}: \\{[^}]*?)letterSpacing: (?:0?\\.[0-9]+|[1-9][0-9]*), `, 'g');
  if (!re.test(text)) { console.log('MISS style:', name); continue; }
  text = text.replace(re, '$1');
}

// The remaining uppercase words.
swap("{run.status.replace('-', ' ').toUpperCase()}", "{run.status.replace('-', ' ')}");
swap("<Text style={styles.settingsStatus}>TEAMS</Text>", "<Text style={styles.settingsStatus}>Teams</Text>");
swap("<Text style={styles.settingsStatus}>LOCAL</Text>", "<Text style={styles.settingsStatus}>Local</Text>");
swap("<Text style={styles.settingsStatus}>PROJECT SCOPED</Text>", "<Text style={styles.settingsStatus}>Project scoped</Text>");

// The styles nothing renders any more.
const styleBody = text.slice(text.indexOf('const styles = StyleSheet.create({'));
const keys = [...styleBody.matchAll(/([A-Za-z]+):\s*\{/g)].map(match => match[1]);
const dead = keys.filter(key => {
  const uses = text.split(`styles.${key}`).length - 1;
  return uses === 0;
});
console.log('dead styles:', dead.join(', ') || 'none');

fs.writeFileSync(file, text, 'utf8');
console.log('letter spacing and capitals cleaned');
