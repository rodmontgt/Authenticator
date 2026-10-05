const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createBroker } = require("../server/google-oauth-broker");

test("Google broker binds a one-use token ticket to state, verifier and extension origin", async (t) => {
  const id = "a".repeat(32);
  const redirect = `https://${id}.chromiumapp.org/`;
  const origin = `chrome-extension://${id}`;
  const verifier = "v".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const calls = [];
  const server = createBroker(
    {
      publicUrl: "http://localhost:8787",
      clientId: "google-id",
      clientSecret: "server-secret",
      redirects: [redirect],
    },
    async (url, options) => {
      calls.push({ url, body: new URLSearchParams(options.body) });
      return {
        ok: true,
        json: async () => ({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
        }),
      };
    }
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(
    `${base}/google/start?${new URLSearchParams({
      redirect_uri: redirect,
      state: "s".repeat(64),
      code_challenge: challenge,
    })}`,
    { redirect: "manual" }
  );
  assert.equal(response.status, 302);
  const auth = new URL(response.headers.get("location"));
  assert.equal(auth.hostname, "accounts.google.com");
  assert.equal(
    auth.searchParams.get("redirect_uri"),
    "http://localhost:8787/google/callback"
  );
  const callback = await fetch(
    `${base}/google/callback?state=${auth.searchParams.get(
      "state"
    )}&code=test-code`,
    { redirect: "manual" }
  );
  const final = new URL(callback.headers.get("location"));
  assert.equal(final.origin, new URL(redirect).origin);
  assert.equal(final.searchParams.get("state"), "s".repeat(64));
  assert.equal(final.searchParams.has("access_token"), false);
  const ticket = final.searchParams.get("ticket");
  async function redeem(code_verifier, requestOrigin = origin) {
    return fetch(`${base}/google/redeem`, {
      method: "POST",
      headers: { Origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, code_verifier }),
    });
  }
  assert.equal(
    (await redeem(verifier, "https://untrusted.example")).status,
    403
  );
  assert.equal((await redeem("x".repeat(64))).status, 400);
  const tokens = await redeem(verifier);
  assert.equal(tokens.status, 200);
  assert.equal(tokens.headers.get("cache-control"), "no-store");
  assert.equal(tokens.headers.get("access-control-allow-origin"), origin);
  assert.equal((await tokens.json()).access_token, "access");
  assert.equal((await redeem(verifier)).status, 400);
  assert.equal(calls[0].body.get("client_secret"), "server-secret");
  assert.equal(calls[0].body.get("code"), "test-code");
  assert.equal(
    (
      await fetch(
        `${base}/google/callback?state=${auth.searchParams.get(
          "state"
        )}&code=replay`,
        { redirect: "manual" }
      )
    ).status,
    400
  );
  assert.equal(
    (
      await fetch(
        `${base}/google/start?${new URLSearchParams({
          redirect_uri: "https://attacker.example/",
          state: "s".repeat(64),
          code_challenge: challenge,
        })}`,
        { redirect: "manual" }
      )
    ).status,
    400
  );
});
