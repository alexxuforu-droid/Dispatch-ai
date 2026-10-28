/**
 * Project-relative path rules shared by the proposal parser and the workspace tools.
 * One rule set, so a path the parser accepts is a path the tools can stage.
 */

/** Normalises a proposed path, or returns null when it may not be used (absolute, traversal, control characters). */
export function normalizeProposalPath(value: string): string | null {
  const path = value.trim().replace(/\\/g, '/');
  if (!path || path.length > 220 || hasControlCharacter(path) || path.startsWith('/') || path.includes(':') || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return path;
}

// The path has to be free of control characters, so the check is a scan rather than a
// regular expression: a regex literal with control characters in it trips no-control-regex.
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) return true;
  }
  return false;
}
