import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ltiPkg from "ltijs";

import type { IdToken } from "ltijs";

const { Provider: lti } = ltiPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const isProd = process.env["NODE_ENV"] === "production";

// ── LTI configuration ───────────────────────────────────────────────
const LTI_ENCRYPTION_KEY = process.env["LTI_ENCRYPTION_KEY"];
const MONGO_URI = process.env["MONGO_URI"];

if (!LTI_ENCRYPTION_KEY) {
  console.error("ERROR: LTI_ENCRYPTION_KEY is not set. The server cannot start without it.");
  process.exit(1);
}

if (!MONGO_URI) {
  console.error("ERROR: MONGO_URI is not set. ltijs requires MongoDB. The server cannot start without it.");
  process.exit(1);
}

// ── Initialise ltijs ─────────────────────────────────────────────────
lti.setup(LTI_ENCRYPTION_KEY, { url: MONGO_URI });

// On successful LTI launch, show the verified student's name and role.
lti.onConnect((token: IdToken, _req, res) => {
  const name =
    token.userInfo?.name ??
    ([token.userInfo?.given_name, token.userInfo?.family_name]
      .filter(Boolean)
      .join(" ") ||
    "(name not provided by platform)");

  const roles = token.platformContext?.roles ?? [];

  // Map full IMS role URIs to short human-readable labels
  const friendlyRoles = roles.map((r) => {
    if (r.includes("#Learner") || r.includes("#Student")) return "Student";
    if (r.includes("#Instructor") || r.includes("#Teacher")) return "Instructor";
    if (r.includes("#Administrator") || r.includes("#Admin")) return "Admin";
    if (r.includes("#TeachingAssistant")) return "Teaching Assistant";
    return r; // fallback: show the raw URI
  });

  const roleText = friendlyRoles.length > 0 ? friendlyRoles.join(", ") : "(no roles)";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>LTI Launch Success</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; margin: 0;
          background: #f0f4f8; color: #1a202c;
        }
        .card {
          background: #fff; border-radius: 12px; padding: 2rem 2.5rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          max-width: 480px; width: 100%;
        }
        h1 { margin: 0 0 0.25rem; font-size: 1.5rem; color: #2d3748; }
        .subtitle { color: #718096; margin: 0 0 1.5rem; font-size: 0.9rem; }
        dl { margin: 0; }
        dt { font-weight: 600; color: #4a5568; margin-top: 1rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
        dd { margin: 0.25rem 0 0; font-size: 1.1rem; }
        .check { color: #38a169; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1><span class="check">✓</span> LTI Launch Verified</h1>
        <p class="subtitle">Identity confirmed via LTI 1.3 handshake</p>
        <dl>
          <dt>Name</dt>
          <dd>${escapeHtml(name)}</dd>
          <dt>Role</dt>
          <dd>${escapeHtml(roleText)}</dd>
          <dt>User ID</dt>
          <dd><code>${escapeHtml(token.user ?? "(unknown)")}</code></dd>
          <dt>Issuer</dt>
          <dd><code>${escapeHtml(token.iss ?? "(unknown)")}</code></dd>
        </dl>
      </div>
    </body>
    </html>
  `);
});

/** Basic HTML-entity escaping for dynamic values rendered into HTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Platform registration ────────────────────────────────────────────
async function registerPlatformFromEnv(): Promise<void> {
  const url = process.env["PLATFORM_URL"];
  const clientId = process.env["PLATFORM_CLIENT_ID"];
  const authEndpoint = process.env["PLATFORM_AUTH_ENDPOINT"];
  const tokenEndpoint = process.env["PLATFORM_TOKEN_ENDPOINT"];
  const keysetEndpoint = process.env["PLATFORM_KEYSET_ENDPOINT"];

  if (!url || !clientId || !authEndpoint || !tokenEndpoint || !keysetEndpoint) {
    console.warn(
      "⚠  LTI platform registration skipped — one or more PLATFORM_* env vars are unset.\n" +
      "   Set PLATFORM_URL, PLATFORM_CLIENT_ID, PLATFORM_AUTH_ENDPOINT,\n" +
      "   PLATFORM_TOKEN_ENDPOINT, and PLATFORM_KEYSET_ENDPOINT in .env after\n" +
      "   registering this tool in Moodle's admin UI."
    );
    return;
  }

  try {
    await lti.registerPlatform({
      url,
      name: "Moodle",
      clientId,
      authenticationEndpoint: authEndpoint,
      accesstokenEndpoint: tokenEndpoint,
      authConfig: {
        method: "JWK_SET",
        key: keysetEndpoint,
      },
    });
    console.log(`✓  LTI platform registered: ${url} (clientId: ${clientId})`);
  } catch (err) {
    // registerPlatform throws if the platform is already registered — that's fine.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already registered") || message.includes("Platform already")) {
      console.log(`✓  LTI platform already registered: ${url}`);
    } else {
      console.error("✗  Failed to register LTI platform:", message);
    }
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Deploy ltijs in serverless mode (does not start its own server)
  await lti.deploy({ serverless: true });
  console.log("✓  ltijs deployed (serverless mode)");

  // Attempt platform registration
  await registerPlatformFromEnv();

  // ── Express app ──────────────────────────────────────────────────
  const app = express();

  // Mount ltijs under /lti — all LTI routes are prefixed:
  //   /lti         — launch redirect (app route)
  //   /lti/login   — OIDC login initiation
  //   /lti/keys    — tool's public JWKS
  app.use("/lti", lti.app);

  // ── API routes ─────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ── Frontend serving ───────────────────────────────────────────
  if (isProd) {
    // In production, serve the pre-built Vite output from client/dist.
    const clientDist = path.resolve(__dirname, "../../client/dist");

    app.use(express.static(clientDist));

    // Catch-all: any non-API request returns index.html so that
    // React Router can handle client-side routes like /student/* and /teacher/*.
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    // In development, the Vite dev server handles the frontend.
    // See README.md for how to run both servers side-by-side.
    app.get("/", (_req, res) => {
      res.send(
        "Server is running in development mode. " +
        "Start the Vite dev server in client/ with `npm run dev` for the frontend. " +
        "See server/README.md for details."
      );
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT} [${isProd ? "production" : "development"}]`);
  });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
