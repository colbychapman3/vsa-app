// Puts the Siri command (plugins/ios/VsaLogCountIntent.swift) into the app target. App Intents are found at build time
// only in the app target, not in a pod, so it can't live in modules/vsa-intents. The pod there only hands the count over.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const FILE = 'VsaLogCountIntent.swift';

const withCopy = (config) => withDangerousMod(config, ['ios', async (c) => {
  const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
  fs.copyFileSync(path.join(c.modRequest.projectRoot, 'plugins', 'ios', FILE), path.join(c.modRequest.platformProjectRoot, name, FILE));
  return c;
}]);

const withSource = (config) => withXcodeProject(config, (c) => {
  const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
  const filepath = `${name}/${FILE}`;
  if (!c.modResults.hasFile(filepath)) IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: c.modResults });
  return c;
});

module.exports = (config) => withSource(withCopy(config));
