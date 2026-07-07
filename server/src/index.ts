import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const isProd = process.env["NODE_ENV"] === "production";

// ── API routes ───────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Frontend serving ─────────────────────────────────────────────────
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
