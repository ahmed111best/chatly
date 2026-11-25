import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'dist-server/**/*', 'node_modules/**/*', '.playwright-cli/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
