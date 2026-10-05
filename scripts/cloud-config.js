const fs = require("fs");
const path = require("path");
const filename = path.resolve(__dirname, "../cloud-config.local.json");
const config = fs.existsSync(filename)
  ? JSON.parse(fs.readFileSync(filename, "utf8"))
  : {};
if (
  config.drive?.client_secret ||
  config.onedrive?.client_secret ||
  config.client_secret
) {
  throw new Error(
    "Client secrets belong only in server/.env, never in the extension configuration"
  );
}
if (
  config.onedrive &&
  config.onedrive.tenant_id &&
  !/^[a-zA-Z0-9.-]+$/.test(config.onedrive.tenant_id)
) {
  throw new Error("Invalid Microsoft tenant ID or domain");
}
if (config.drive && config.drive.token_broker_url) {
  const url = new URL(config.drive.token_broker_url);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && url.hostname === "localhost")
  ) {
    throw new Error(
      "Google token broker must use HTTPS (or localhost for development)"
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Google token broker must be an origin without a path or credentials"
    );
  }
  config.drive.token_broker_url = url.origin;
}
for (const [section, fields] of [
  ["drive", ["client_id", "token_broker_url"]],
  ["onedrive", ["client_id", "tenant_id"]],
]) {
  for (const field of fields) {
    if (
      config[section]?.[field] !== undefined &&
      typeof config[section][field] !== "string"
    ) {
      throw new Error(
        `Cloud configuration field ${section}.${field} must be a string`
      );
    }
  }
}
module.exports = {
  drive: {
    client_id: config.drive?.client_id || "",
    token_broker_url: config.drive?.token_broker_url || "",
  },
  onedrive: {
    client_id: config.onedrive?.client_id || "",
    tenant_id: config.onedrive?.tenant_id || "",
  },
};
