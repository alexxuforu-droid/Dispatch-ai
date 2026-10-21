// The two misses from the last pass: the import line and the place the hover state belongs.
import fs from 'node:fs';

const file = 'src/RunWorkspace.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS', from.slice(0, 80)); return; }
  text = text.replace(from, to);
};

swap(
  "import { Button, Chip, EmptyState, Section } from './ui';",
  "import { Button, Chip, EmptyState, Section } from './ui';\nimport { relativeTime } from './relativeTime';",
);

swap(
  "  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);",
  "  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);\n  const [hoveredRun, setHoveredRun] = useState<string | null>(null);",
);

fs.writeFileSync(file, text, 'utf8');
console.log('run workspace hover state placed');
