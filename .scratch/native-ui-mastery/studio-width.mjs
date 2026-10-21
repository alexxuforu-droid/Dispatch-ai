// The design studio was the one screen that still used the platform window dimension, which
// on React Native Windows never follows a resize. The window was 1500 pixels wide and the
// studio laid itself out for a narrow one: the left rail took the whole width and the
// canvas and the brief were pushed below the fold.
//
// The frame measures itself in the app shell, so the measured width is passed down.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text, 'utf8');
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

swap('src/DesignStudio.tsx',
  'export function DesignStudio({ roles, activeTeamName, runHistory, latestRun, onSendBrief, onError }: { roles: { id: string; label: string }[]; activeTeamName: string; runHistory: Run[]; latestRun: Run | null; onSendBrief: (data: {brief:string; reference?:DesignImageReference; annotations:DesignAnnotation[]}) => void; onError:(message:string)=>void }) {',
  'export function DesignStudio({ roles, activeTeamName, runHistory, latestRun, onSendBrief, onError, width }: { roles: { id: string; label: string }[]; activeTeamName: string; runHistory: Run[]; latestRun: Run | null; onSendBrief: (data: {brief:string; reference?:DesignImageReference; annotations:DesignAnnotation[]}) => void; onError:(message:string)=>void; width: number }) {');

swap('src/DesignStudio.tsx',
  '  const { width } = useWindowDimensions();\n',
  '');

swap('src/DesignStudio.tsx',
  "import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';",
  "import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';");

swap('App.tsx',
  "screen === 'design' ? <DesignStudio roles={roles}",
  "screen === 'design' ? <DesignStudio width={width} roles={roles}");

console.log('the studio now lays itself out from the measured width');
