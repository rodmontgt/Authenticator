// Keep Google's Web application secret on the server, never in the extension.
const http = require("node:http");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");

function createBroker(config, providerFetch = fetch) {
  const redirects = new Set(config.redirects);
  const allowedOrigins = new Set(
    config.redirects.map(
      (value) => `chrome-extension://${new URL(value).hostname.split(".")[0]}`
    )
  );
  const pending = new Map();
  const tickets = new Map();
  const random = () => randomBytes(32).toString("base64url");
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.end(JSON.stringify(data));
  };
  async function token(parameters) {
    const response = await providerFetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...parameters,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.access_token) {
      const error = new Error("Google authorization failed");
      error.code =
        data.error === "invalid_grant"
          ? "invalid_grant"
          : "google_authorization_failed";
      throw error;
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  }
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, config.publicUrl);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    for (const collection of [pending, tickets]) {
      for (const [key, value] of collection)
        if (value.expires <= Date.now()) collection.delete(key);
    }
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(origin && allowedOrigins.has(origin) ? 204 : 403);
      res.end();
      return;
    }
    try {
      if (req.method === "GET" && url.pathname === "/google/start") {
        const redirect = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        const challenge = url.searchParams.get("code_challenge");
        if (
          !redirects.has(redirect) ||
          !/^[a-zA-Z0-9_-]{43,128}$/.test(state || "") ||
          !/^[a-zA-Z0-9_-]{43}$/.test(challenge || "")
        )
          return json(res, 400, { error: "invalid_request" });
        if (pending.size + tickets.size >= 1000)
          return json(res, 429, { error: "too_many_requests" });
        const serverState = random();
        pending.set(serverState, {
          redirect,
          state,
          challenge,
          expires: Date.now() + 10 * 60000,
        });
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.search = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: `${config.publicUrl}/google/callback`,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent select_account",
          state: serverState,
        }).toString();
        res.writeHead(302, { Location: auth.toString() });
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/google/callback") {
        const state = url.searchParams.get("state");
        const request = pending.get(state);
        if (!request) return json(res, 400, { error: "invalid_state" });
        pending.delete(state);
        const redirect = new URL(request.redirect);
        redirect.searchParams.set("state", request.state);
        try {
          const code = url.searchParams.get("code");
          if (!code || url.searchParams.has("error"))
            throw new Error("Authorization denied");
          const tokens = await token({
            code,
            redirect_uri: `${config.publicUrl}/google/callback`,
            grant_type: "authorization_code",
          });
          const ticket = random();
          tickets.set(ticket, {
            tokens,
            challenge: request.challenge,
            redirect: request.redirect,
            expires: Date.now() + 60000,
          });
          redirect.searchParams.set("ticket", ticket);
        } catch {
          redirect.searchParams.set("error", "google_authorization_failed");
        }
        res.writeHead(302, { Location: redirect.toString() });
        res.end();
        return;
      }
      if (
        req.method !== "POST" ||
        !["/google/redeem", "/google/refresh"].includes(url.pathname)
      )
        return json(res, 404, { error: "not_found" });
      if (!origin || !allowedOrigins.has(origin))
        return json(res, 403, { error: "origin_not_allowed" });
      if (!(req.headers["content-type"] || "").startsWith("application/json"))
        return json(res, 415, { error: "json_required" });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 16384)
          return json(res, 413, { error: "request_too_large" });
      }
      const data = JSON.parse(body);
      if (url.pathname === "/google/redeem") {
        const ticket = tickets.get(data.ticket);
        if (
          !ticket ||
          typeof data.code_verifier !== "string" ||
          !/^[a-zA-Z0-9._~-]{43,128}$/.test(data.code_verifier)
        )
          return json(res, 400, { error: "invalid_ticket" });
        const expectedOrigin = `chrome-extension://${
          new URL(ticket.redirect).hostname.split(".")[0]
        }`;
        const challenge = createHash("sha256")
          .update(data.code_verifier)
          .digest("base64url");
        if (
          origin !== expectedOrigin ||
          !timingSafeEqual(
            Buffer.from(challenge),
            Buffer.from(ticket.challenge)
          )
        )
          return json(res, 400, { error: "invalid_ticket" });
        tickets.delete(data.ticket);
        return json(res, 200, ticket.tokens);
      }
      if (typeof data.refresh_token !== "string" || !data.refresh_token)
        return json(res, 400, { error: "invalid_request" });
      return json(
        res,
        200,
        await token({
          refresh_token: data.refresh_token,
          grant_type: "refresh_token",
        })
      );
    } catch (error) {
      const badInput = error instanceof SyntaxError;
      json(res, badInput || error.code === "invalid_grant" ? 400 : 502, {
        error: badInput ? "invalid_request" : error.code || "broker_error",
      });
    }
  });
}

if (require.main === module) {
  const publicUrl = process.env.GOOGLE_BROKER_PUBLIC_URL;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirects = (process.env.EXTENSION_REDIRECT_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!publicUrl || !clientId || !clientSecret || !redirects.length)
    throw new Error(
      "Set GOOGLE_BROKER_PUBLIC_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and EXTENSION_REDIRECT_URLS."
    );
  const parsed = new URL(publicUrl);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && parsed.hostname === "localhost")
  )
    throw new Error("Use HTTPS, or localhost for development.");
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  )
    throw new Error("Public URL must be an origin.");
  for (const redirect of redirects)
    if (!/^https:\/\/[a-p]{32}\.chromiumapp\.org\/$/.test(redirect))
      throw new Error("Allow only exact extension redirect URLs.");
  const server = createBroker({
    publicUrl: parsed.origin,
    clientId,
    clientSecret,
    redirects,
  });
  server.requestTimeout = 35000;
  server.listen(
    Number(process.env.PORT || 8787),
    process.env.HOST || "127.0.0.1",
    () => console.log("Google OAuth broker is ready.")
  );
}

module.exports = { createBroker };
