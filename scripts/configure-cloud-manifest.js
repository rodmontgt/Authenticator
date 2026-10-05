const fs = require("fs");
const config = require("./cloud-config");

function configureManifest(filename) {
  if (!config.drive || !config.drive.token_broker_url) return;
  const manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
  // This configuration applies to the Chromium targets only.
  if (!manifest.background || !manifest.background.service_worker) return;
  const broker = new URL(config.drive.token_broker_url);
  const permission = `${broker.protocol}//${broker.hostname}/*`;
  if (!manifest.optional_host_permissions.includes(permission))
    manifest.optional_host_permissions.push(permission);
  if (
    !manifest.content_security_policy.extension_pages.includes(
      broker.origin + " "
    )
  ) {
    manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace(
      "connect-src ",
      `connect-src ${broker.origin} `
    );
  }
  fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + "\n");
}

if (require.main === module) configureManifest(process.argv[2]);
module.exports = { configureManifest };
