module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void somePromise()` as a statement is how this codebase marks a promise that is
    // deliberately not awaited, so the rule only fires on `void` used as a value.
    'no-void': ['error', { allowAsStatement: true }],
  },
};
