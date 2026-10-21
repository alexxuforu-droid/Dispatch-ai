// The last hand-rolled input in the settings form.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const re = /<Text style=\{styles\.fieldLabel\}>Image-generation model \(optional\)<\/Text><TextInput accessibilityLabel="Image-generation model ID"[^\n]*\r?\n\s*<Text style=\{styles\.providerHint\}>The chat model also needs image-input support for automatic visual review\. Unsupported review stays pending for you\.<\/Text>/;
if (!re.test(text)) { console.log('MISS'); process.exit(1); }

text = text.replace(re, '<Field label="Image-generation model (optional)" accessibilityLabel="Image-generation model ID" value={profile.imageModel} onChangeText={value => update(\'imageModel\', value)} placeholder="Enter a model that supports image generation" hint="The chat model also needs image-input support for automatic visual review. Unsupported review stays pending for you." />');

fs.writeFileSync(file, text, 'utf8');
console.log('image model field converted');
