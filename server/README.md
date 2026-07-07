# Server

Minimal Express + TypeScript backend that serves the built React frontend
as a monolith and exposes API routes on the same origin.

## Prerequisites

```
cd server && npm install
```

## Modes of operation

The server's behaviour is controlled by the `NODE_ENV` environment variable.

### Production (`NODE_ENV=production`)

The server serves `client/dist` (the Vite build output) as static files.
Any request that doesn't match an `/api/*` route returns `index.html`, so
React Router's client-side routes (e.g. `/student/*`, `/teacher/*`) work
correctly on a hard refresh.

```bash
# From the repo root:
npm run build          # builds client, compiles server, starts in prod mode
```

### Development (`NODE_ENV` unset or not `"production"`)

The server does **not** serve the frontend. Instead, you run the Vite dev
server in `client/` separately. This gives you Vite's HMR and fast
rebuilds for the frontend, while the Express server handles API routes.

```bash
# From the repo root — starts both in parallel:
npm run dev
```

This runs two processes concurrently:

| Process       | Port | What it serves                      |
|---------------|------|-------------------------------------|
| Vite dev      | 5173 | React app with HMR                  |
| Express       | 3000 | API routes (`/api/*`)               |

During development, open the **Vite** URL (http://localhost:5173) in your
browser. If your frontend needs to call `/api/*` endpoints, configure
Vite's proxy in `client/vite.config.ts` to forward those requests to the
Express server (see below).

#### Optional: Vite API proxy

Add this to `client/vite.config.ts` so frontend `fetch("/api/...")` calls
reach the Express server during development:

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
```

## API routes

| Method | Path           | Response               |
|--------|----------------|------------------------|
| GET    | `/api/health`  | `{ "status": "ok" }`   |

## Port

Defaults to `3000`. Override with the `PORT` environment variable.
