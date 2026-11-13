import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FocusPressable } from './Reveal';
import { colors, radius, typography } from './theme';
import { pickDesignReferenceImage, DesignImageReference } from './persistence/workspaceProject';
import { DesignAnnotation } from './orchestration/types';

/**
 * Design studio: attach a screenshot, say what to change, send it to Dispatch.
 *
 * That is the whole screen. The screenshot rides along with the brief, so the team sees
 * exactly what the person was looking at when they described the change.
 */
export function DesignStudio({ onSendBrief, onError }: { onSendBrief: (data: { brief: string; reference?: DesignImageReference; annotations: DesignAnnotation[] }) => void; onError: (message: string) => void }) {
  const [reference, setReference] = useState<DesignImageReference>();
  const [prompt, setPrompt] = useState('');
  const attach = () => {
    pickDesignReferenceImage()
      .then(image => { if (image) setReference(image); })
      .catch(error => onError(error instanceof Error ? error.message : 'Could not attach the screenshot.'));
  };
  return <ScrollView style={s.page} contentContainerStyle={s.pageContent}>
    <Text style={s.title}>Design studio</Text>
    <FocusPressable accessibilityRole="button" accessibilityLabel="Attach a screenshot" onPress={attach} style={({ pressed }) => [s.attachButton, pressed && s.pressed]}>
      <Text style={s.attachText}>{reference ? 'Replace screenshot' : 'Attach screenshot'}</Text>
    </FocusPressable>
    {reference ? <View style={s.previewFrame}>
      <Image source={{ uri: reference.uri }} resizeMode="contain" accessibilityLabel="Attached screenshot" style={s.previewImage} />
      <FocusPressable accessibilityRole="button" accessibilityLabel="Remove the screenshot" onPress={() => setReference(undefined)} style={s.removeButton}>
        <Text style={s.removeText}>Remove</Text>
      </FocusPressable>
    </View> : null}
    <TextInput
      value={prompt}
      onChangeText={setPrompt}
      multiline
      maxLength={4000}
      accessibilityLabel="Describe the change"
      placeholder="Describe the change"
      placeholderTextColor={colors.textMuted}
      style={s.input}
      textAlignVertical="top"
    />
    <FocusPressable
      accessibilityRole="button"
      disabled={!prompt.trim() && !reference}
      onPress={() => onSendBrief({ brief: prompt.trim(), reference, annotations: [] })}
      style={({ pressed }) => [s.sendButton, pressed && s.pressed]}>
      <Text style={s.sendText}>Send to Dispatch</Text>
    </FocusPressable>
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingHorizontal: 22, paddingTop: 19, paddingBottom: 34, gap: 14 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600', letterSpacing: -.6 },
  attachButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised },
  attachText: { color: colors.text, fontFamily: typography.body, fontSize: 13, fontWeight: '700' },
  previewFrame: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, backgroundColor: colors.page, padding: 10, gap: 8 },
  previewImage: { width: '100%', height: 320, borderRadius: 6 },
  removeButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.line },
  removeText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 12 },
  input: { minHeight: 120, color: colors.text, fontFamily: typography.body, fontSize: 14, lineHeight: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  sendButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: colors.lead },
  sendText: { color: colors.page, fontFamily: typography.body, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: .78 },
});
