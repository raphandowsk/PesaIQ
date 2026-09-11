// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite runs on web as WebAssembly (wa-sqlite) inside a worker, so Metro
// has to serve .wasm files. Native builds never request one.
//
// No cross-origin-isolation (COOP/COEP) headers are set, deliberately.
// expo-sqlite needs SharedArrayBuffer, and so isolation, only for its
// synchronous API. PesaIQ uses the async API exclusively (database/client.ts),
// which reaches the worker by message passing. Verified in the web preview:
// the page is not cross-origin isolated, and records and settings still
// survive a reload.
config.resolver.assetExts.push('wasm');

module.exports = config;
