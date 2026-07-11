import "dotenv/config";
import dns from "node:dns";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Force IPv4-first DNS resolution globally.
// Docker's embedded DNS returns both IPv6 (AAAA) and IPv4 (A) records for
// container aliases. Node 18+'s "Happy Eyeballs" algorithm tries IPv6 first,
// but Docker bridge networks don't route IPv6 between containers, causing
// an immediate ECONNREFUSED before the valid IPv4 address is attempted.
dns.setDefaultResultOrder("ipv4first");
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

// ── Process-level crash guards ──────────────────────────────────────
// Prevent silent death from ltijs's internal reconnection promises or
// any other unhandled async failure in the MongoDB driver.
process.on("unhandledRejection", (reason: unknown) => {
  console.error("⚠  Unhandled promise rejection:", reason);
  // Do NOT exit — allow Mongoose reconnection attempts to continue.
});

process.on("uncaughtException", (err: Error) => {
  console.error("✗  Uncaught exception:", err);
  // Exit with failure so Docker's restart policy can bring us back clean.
  process.exit(1);
});

// ── Initialise ltijs ─────────────────────────────────────────────────
lti.setup(
  LTI_ENCRYPTION_KEY,
  {
    url: MONGO_URI,
    connection: {
      family: 4,                      // Force IPv4 — Docker bridge does not support IPv6
      serverSelectionTimeoutMS: 5000,  // Fail fast on server selection (default: 30s)
      socketTimeoutMS: 45000,          // Close idle sockets after 45s (default: 0/infinite)
      heartbeatFrequencyMS: 10000,     // Check server health every 10s
      connectTimeoutMS: 10000,         // Initial TCP timeout (overrides ltijs's 300s default)
      maxPoolSize: 5,                  // Bounded pool for a single-service architecture
      retryWrites: true,
      retryReads: true
    }
  },
  {
    appRoute: "/lti",
    loginRoute: "/lti/login",
    keysetRoute: "/lti/keys",
    devMode: true // Relax cookie restrictions for plain HTTP localhost
  }
);

// ── Error Handlers ──────────────────────────────────────────────────
lti.onInvalidToken(async (_req: express.Request, res: express.Response) => {
  console.warn("⚠  LTI invalid token received");
  return res.status(401).send("Invalid LTI Token sequence.");
});

lti.onUnregisteredPlatform(async (_req: express.Request, res: express.Response) => {
  console.warn("⚠  LTI request from unregistered platform");
  return res.status(400).send("Platform registration profile missing.");
});

// On successful LTI launch, redirect based on role.
lti.onConnect((token: IdToken, _req: express.Request, res: express.Response) => {
  const roles = token.platformContext?.roles ?? [];

  const isTeacher = roles.some(
    (r) => r.includes("#Instructor") || r.includes("#Teacher")
  );

  if (isTeacher) {
    lti.redirect(res, "/teacher");
  } else {
    lti.redirect(res, "/student");
  }
});


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
    // Force delete the existing platform config from the DB so it picks up the new endpoints
    await lti.deletePlatform(url, clientId);
    
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
    
    // DEBUG: Test the keyset endpoint connectivity
    try {
      const keysetUrl = new URL(keysetEndpoint);
      console.log(`DEBUG: Resolving DNS for ${keysetUrl.hostname}...`);
      const addresses = await dns.promises.lookup(keysetUrl.hostname, { all: true });
      console.log(`DEBUG: DNS resolved to:`, JSON.stringify(addresses));
      console.log(`DEBUG: Testing keyset fetch to ${keysetEndpoint}`);
      const res = await fetch(keysetEndpoint);
      console.log(`DEBUG: Keyset fetch status: ${res.status}`);
    } catch (err) {
      console.error("DEBUG: Keyset connectivity test failed:", err);
    }
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

// ── Mongoose connection observability ────────────────────────────────
// ltijs's Database.js wires its own event handlers using debug() which
// requires the DEBUG env var to be set. These handlers give us always-on
// visibility into the connection lifecycle.
import mongoose from "mongoose";

mongoose.connection.on("connected", () => {
  console.log("✓  MongoDB connected");
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠  MongoDB disconnected — Mongoose will attempt to reconnect");
});

mongoose.connection.on("reconnected", () => {
  console.log("✓  MongoDB reconnected");
});

mongoose.connection.on("error", (err: Error) => {
  console.error("✗  MongoDB connection error:", err.message);
});

// ── Bootstrap ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Deploy ltijs in serverless mode (does not start its own server)
  await lti.deploy({ serverless: true });
  console.log("✓  ltijs deployed (serverless mode)");

  // Attempt platform registration
  await registerPlatformFromEnv();

  // ── Express app ──────────────────────────────────────────────────
  const app = express();

  // Create an isolated router instance for our existing custom system
  const apiRouter = express.Router();
  apiRouter.use(express.json());
  apiRouter.use(express.urlencoded({ extended: true }));

  // Re-register our existing health route safely under the API namespace
  apiRouter.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ status: "ok" });
  });

  // Mount the API router onto the server BEFORE mounting ltijs
  app.use("/api", apiRouter);

  // ── Frontend Static Assets ───────────────────────────────────────
  // Serve static assets BEFORE ltijs to prevent the session validator from
  // blocking requests for .js, .css, etc. which don't carry an ltik.
  const clientDist = path.resolve(__dirname, "../../client/dist");
  if (isProd) {
    app.use(express.static(clientDist));
  }

  // Mount ltijs at the root level.
  // Because the body parsers are locked behind /api, the incoming LTI POST stream
  // from Moodle passes to ltijs completely untouched and readable.
  app.use(lti.app);

  // ── Protected API routes ───────────────────────────────────────
  // These routes are mounted after lti.app, so they are protected by ltijs's sessionValidator.
  // The frontend must pass the `ltik` in the Authorization header: `Bearer <ltik>`
  app.get("/api/session/me", (_req: express.Request, res: express.Response) => {
    const token = res.locals.token as IdToken | undefined;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const roles = token.platformContext?.roles ?? [];
    const isTeacher = roles.some(
      (r) => r.includes("#Instructor") || r.includes("#Teacher")
    );

    res.json({
      userId: token.user,
      name: token.userInfo?.name ?? "Unknown User",
      role: isTeacher ? "teacher" : "student",
    });
  });

  // ── Frontend Catch-all ─────────────────────────────────────────
  if (isProd) {
    // Catch-all: any non-API request returns index.html so that
    // React Router can handle client-side routes like /student/* and /teacher/*.
    app.get("/*splat", (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    // In development, the Vite dev server handles the frontend.
    // See README.md for how to run both servers side-by-side.
    app.get("/", (_req: express.Request, res: express.Response) => {
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
