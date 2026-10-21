// App shell corrections that must hold whatever else the app changes:
//
// 1. The window width the app reacts to is the width of its own frame. The platform
//    dimension does not follow a resized window here, so the app never left the narrow
//    layout no matter how wide the window was.
// 2. The notice is a toast in the one slot, not a banner over the content.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

// The frame measures itself.
swap(
  "  const { width } = useWindowDimensions();\n  const compact = width < 1040;",
  "  const { width: windowWidth } = useWindowDimensions();\n  // The platform dimension does not follow a resized window, so the frame measures itself\n  // and the layout follows what the person can actually see.\n  const [frameWidth, setFrameWidth] = useState(0);\n  const width = frameWidth || windowWidth;\n  const compact = width < 1040;",
);

swap(
  "    <View style={styles.shell}>",
  "    <View style={styles.shell} onLayout={event => setFrameWidth(event.nativeEvent.layout.width)}>",
);

// The toast slot.
swap(
  "    <TeamPicker visible={teamPicker}",
  "    <ToastSlot>{notice ? <Toast title={notice} onDismiss={() => setNotice('')} /> : null}</ToastSlot>\n    <TeamPicker visible={teamPicker}",
);

fs.writeFileSync(file, text, 'utf8');
console.log('app shell corrections applied');
