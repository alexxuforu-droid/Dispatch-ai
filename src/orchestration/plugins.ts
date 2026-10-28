/** The engine-side plugin switches: which capabilities this run may use. */
export type PluginFlags = { workspaceFiles: boolean; imageGeneration: boolean; codeReview: boolean; visualReview: boolean };

/** Every plugin on: the engine's default before the user's settings say otherwise. */
export const defaultPluginFlags: PluginFlags = { workspaceFiles: true, imageGeneration: true, codeReview: true, visualReview: true };
