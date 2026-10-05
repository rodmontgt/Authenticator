declare const __CLOUD_CONFIG__: {
  drive?: { client_id?: string; token_broker_url?: string };
  onedrive?: { client_id?: string; tenant_id?: string };
};

export function getCredentials() {
  const config =
    typeof __CLOUD_CONFIG__ === "undefined" ? {} : __CLOUD_CONFIG__;
  return {
    drive: {
      client_id: config.drive?.client_id || "", // Google Web application client ID
      token_broker_url: config.drive?.token_broker_url || "",
    },
    dropbox: {
      client_id: "", // Dropbox client ID
    },
    onedrive: {
      client_id: config.onedrive?.client_id || "", // Microsoft SPA client ID
      tenant_id: config.onedrive?.tenant_id || "",
    },
  };
}
