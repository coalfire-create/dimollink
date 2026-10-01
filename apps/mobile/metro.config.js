const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// npm workspaces monorepo settings
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return context.resolveRequest(context, '@teovilla/react-native-web-maps', platform);
  }
  // 포트원 브라우저 SDK 는 package.json `exports`("./v2")로만 진입점을 연다. 이 Metro 는
  // exports 를 읽지 않으므로 실제 파일로 직접 잇는다(웹 결제창 — screens/store/webPayment.web.ts).
  if (moduleName === '@portone/browser-sdk/v2') {
    return context.resolveRequest(context, '@portone/browser-sdk/dist/v2.js', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
