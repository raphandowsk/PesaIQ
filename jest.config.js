const fs = require('fs');
const path = require('path');

// expo-modules-core is expo's own dependency, and npm may nest it under
// node_modules/expo instead of hoisting it: it does while the installed
// react-native-worklets (0.12) sits outside expo-modules-core's optional peer
// range. jest-expo's setup requires it by bare name, and plain Node resolution
// looks only at the top level. So resolve it the way expo itself does,
// wherever npm put it.
const expoDir = path.dirname(require.resolve('expo/package.json'));
const expoModulesCoreEntry = require.resolve('expo-modules-core', { paths: [expoDir] });
let expoModulesCoreDir = path.dirname(expoModulesCoreEntry);
while (!fs.existsSync(path.join(expoModulesCoreDir, 'package.json'))) {
  expoModulesCoreDir = path.dirname(expoModulesCoreDir);
}

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^expo-modules-core$': expoModulesCoreEntry,
    '^expo-modules-core/(.*)$': path.join(expoModulesCoreDir, '$1'),
  },
  setupFilesAfterEnv: [],
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
  collectCoverageFrom: ['features/**/*.ts', 'theme/**/*.ts', '!**/node_modules/**'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
};
