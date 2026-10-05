import { getCredentials } from "./credentials";
import { UserSettings } from "./settings";

export type CloudService = "drive" | "onedrive";
const graphScopes =
  "https://graph.microsoft.com/Files.ReadWrite.AppFolder https://graph.microsoft.com/User.Read offline_access";
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export class CloudError extends Error {
  constructor(message: string, public status = 0, public code = "") {
    super(message);
  }
}

export async function cloudFetch(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      const code =
        typeof data.error === "string" ? data.error : data.error?.code;
      // Never surface response bodies: providers can include authorization data.
      throw new CloudError(
        `Cloud request failed (HTTP ${response.status}${
          code && /^[a-zA-Z0-9_.-]+$/.test(code) ? `, ${code}` : ""
        }).`,
        response.status,
        code || ""
      );
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function randomOAuthValue() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function parseOAuthRedirect(
  response: string,
  redirect: string,
  state: string
) {
  const url = new URL(response);
  const expected = new URL(redirect);
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.searchParams.get("state") !== state
  ) {
    throw new Error("Invalid authentication response. Please sign in again.");
  }
  if (url.searchParams.has("error"))
    throw new Error(
      "Authorization was denied or requires administrator approval."
    );
  return url.searchParams;
}

function launchAuth(url: string) {
  return new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url, interactive: true },
      (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response)
          reject(
            new Error(
              "Sign-in was cancelled or could not finish. Check the OAuth redirect URL and application configuration."
            )
          );
        else resolve(response);
      }
    );
  });
}

export function cloudOrigins(service: CloudService) {
  if (service === "onedrive")
    return [
      "https://graph.microsoft.com/*",
      "https://login.microsoftonline.com/*",
    ];
  const broker = getCredentials().drive.token_broker_url;
  return [
    "https://www.googleapis.com/*",
    ...(broker
      ? [`${new URL(broker).protocol}//${new URL(broker).hostname}/*`]
      : []),
  ];
}

function microsoftAuthority(business = UserSettings.items.oneDriveBusiness) {
  const tenant = business
    ? getCredentials().onedrive.tenant_id || "organizations"
    : "consumers";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

async function saveTokens(service: CloudService, tokens: TokenResponse) {
  if (
    !tokens.access_token ||
    !Number.isFinite(Number(tokens.expires_in)) ||
    Number(tokens.expires_in) <= 0
  )
    throw new Error("The provider did not return a valid access token.");
  await UserSettings.updateItems();
  const prefix = service === "drive" ? "drive" : "oneDrive";
  UserSettings.items[`${prefix}Token`] = tokens.access_token;
  UserSettings.items[`${prefix}TokenExpiresAt`] =
    Date.now() + Number(tokens.expires_in) * 1000;
  if (tokens.refresh_token)
    UserSettings.items[`${prefix}RefreshToken`] = tokens.refresh_token;
  UserSettings.items[`${prefix}Revoked`] = false;
  UserSettings.items.cloudBackupError = undefined;
  UserSettings.items.cloudBackupErrorService = undefined;
  await UserSettings.commitItems();
}

export async function connectCloud(service: CloudService, business = false) {
  await UserSettings.updateItems();
  const credentials = getCredentials();
  const clientId =
    service === "drive"
      ? credentials.drive.client_id
      : credentials.onedrive.client_id;
  if (!clientId)
    throw new Error(
      "Configure your OAuth application in cloud-config.local.json and rebuild the extension first."
    );
  if (service === "drive" && !credentials.drive.token_broker_url)
    throw new Error(
      "Configure the Google OAuth token broker before signing in."
    );
  const redirect = chrome.identity.getRedirectURL();
  const state = randomOAuthValue();
  const verifier = randomOAuthValue();
  const challenge = await pkceChallenge(verifier);
  let url: URL;
  if (service === "drive") {
    url = new URL(`${credentials.drive.token_broker_url}/google/start`);
    url.search = new URLSearchParams({
      redirect_uri: redirect,
      state,
      code_challenge: challenge,
    }).toString();
  } else {
    url = new URL(`${microsoftAuthority(business)}/authorize`);
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirect,
      response_mode: "query",
      scope: graphScopes,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
  }
  const parameters = parseOAuthRedirect(
    await launchAuth(url.toString()),
    redirect,
    state
  );
  let tokens: TokenResponse;
  if (service === "drive") {
    const ticket = parameters.get("ticket");
    if (!ticket)
      throw new Error(
        "The Google OAuth broker did not return a sign-in ticket."
      );
    tokens = await cloudFetch(
      `${credentials.drive.token_broker_url}/google/redeem`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, code_verifier: verifier }),
      }
    );
  } else {
    const code = parameters.get("code");
    if (!code)
      throw new Error("Microsoft did not return an authorization code.");
    tokens = await cloudFetch(`${microsoftAuthority(business)}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirect,
        grant_type: "authorization_code",
        scope: graphScopes,
      }).toString(),
    });
  }
  // A new account must not reuse the previous account's folder or refresh token.
  await disconnectCloud(service);
  if (service === "onedrive") {
    UserSettings.items.oneDriveBusiness = business;
    await UserSettings.commitItems();
  }
  await saveTokens(service, tokens);
}

export async function disconnectCloud(service: CloudService) {
  await UserSettings.updateItems();
  const prefix = service === "drive" ? "drive" : "oneDrive";
  UserSettings.items[`${prefix}Token`] = undefined;
  UserSettings.items[`${prefix}RefreshToken`] = undefined;
  UserSettings.items[`${prefix}TokenExpiresAt`] = undefined;
  UserSettings.items[`${prefix}Revoked`] = false;
  if (service === "drive") UserSettings.items.driveFolder = undefined;
  if (UserSettings.items.cloudBackupErrorService === service) {
    UserSettings.items.cloudBackupError = undefined;
    UserSettings.items.cloudBackupErrorService = undefined;
  }
  await UserSettings.commitItems();
}

const refreshing: Partial<
  Record<CloudService, Promise<string | undefined>>
> = {};
export async function getCloudToken(
  service: CloudService,
  forceRefresh = false
): Promise<string | undefined> {
  await UserSettings.updateItems();
  const prefix = service === "drive" ? "drive" : "oneDrive";
  const token = UserSettings.items[`${prefix}Token`];
  const expiresAt = UserSettings.items[`${prefix}TokenExpiresAt`] || 0;
  if (!forceRefresh && token && expiresAt > Date.now() + 60000) return token;
  if (refreshing[service]) return refreshing[service];
  const refreshToken = UserSettings.items[`${prefix}RefreshToken`];
  if (!refreshToken) {
    await disconnectCloud(service);
    UserSettings.items[`${prefix}Revoked`] = true;
    await UserSettings.commitItems();
    return undefined;
  }
  const pending = (async () => {
    const credentials = getCredentials();
    try {
      const tokens =
        service === "drive"
          ? await cloudFetch(
              `${credentials.drive.token_broker_url}/google/refresh`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: refreshToken }),
              }
            )
          : await cloudFetch(`${microsoftAuthority()}/token`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: credentials.onedrive.client_id,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
                scope: graphScopes,
              }).toString(),
            });
      await UserSettings.updateItems();
      // A refresh started before logout must not reconnect the account.
      if (UserSettings.items[`${prefix}RefreshToken`] !== refreshToken)
        return UserSettings.items[`${prefix}Token`];
      await saveTokens(service, tokens);
      return tokens.access_token as string;
    } catch (error) {
      if (
        error instanceof CloudError &&
        (error.code === "invalid_grant" ||
          error.code === "interaction_required")
      ) {
        await UserSettings.updateItems();
        if (UserSettings.items[`${prefix}RefreshToken`] !== refreshToken)
          return UserSettings.items[`${prefix}Token`];
        await disconnectCloud(service);
        UserSettings.items[`${prefix}Revoked`] = true;
        await UserSettings.commitItems();
        return undefined;
      }
      throw error;
    }
  })();
  refreshing[service] = pending;
  try {
    return await pending;
  } finally {
    delete refreshing[service];
  }
}

export async function cloudRequest(
  service: CloudService,
  url: string,
  init: RequestInit = {}
) {
  let token = await getCloudToken(service);
  if (!token) throw new Error("Your cloud session has expired. Sign in again.");
  const request = () =>
    cloudFetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof CloudError) || error.status !== 401) throw error;
    token = await getCloudToken(service, true);
    if (!token)
      throw new Error("Your cloud session has expired. Sign in again.");
    return request();
  }
}
