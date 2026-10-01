// Reminders are local notifications, so the app needs no push capability. expo-notifications' own plugin adds the
// aps-environment entitlement, which the ad-hoc provisioning profile does not allow and the build then fails.
const { withEntitlementsPlist } = require('expo/config-plugins');
module.exports = (config) => withEntitlementsPlist(config, (c) => { delete c.modResults['aps-environment']; return c; });
