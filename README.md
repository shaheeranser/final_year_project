# Final Year Project

## Running the Full Stack

This project provides a complete dockerized setup using Docker Compose, spinning up the following services:
- **App**: The monolithic Express server serving the Vite React frontend.
- **MongoDB**: For application data storage.
- **MinIO**: S3-compatible object storage for incident snapshots.
- **Caddy**: A reverse proxy for serving the application.

### Prerequisites
- Docker and Docker Compose installed.

### Setup Instructions

1. **Environment Configuration**
   Copy the provided example environment file to create your local configuration:
   ```bash
   cp .env.example .env
   ```
   *(Note: The `.env` file is gitignored to avoid committing secrets.)*

2. **Network Initialization**
   Create the shared Docker network that allows the app stack and the Moodle dev stack to communicate:
   ```bash
   docker network create examnet
   ```

3. **Start the Stack**
   Bring up the entire system with Docker Compose:
   ```bash
   docker compose up -d
   ```
   *This command will build the app, start all dependent services, and automatically initialize the MinIO bucket.*

4. **Service Ports**
   Once started, the services will be available at:
   - **App**: [http://localhost:3000](http://localhost:3000)
   - **Caddy (Reverse Proxy)**: [http://localhost](http://localhost) (and port 443 for HTTPS if a domain is configured)
   - **MinIO API**: [http://localhost:9000](http://localhost:9000)
   - **MinIO Console**: [http://localhost:9001](http://localhost:9001)

### Local Moodle for LTI development

A separate Moodle instance is required for local LTI integration testing. This uses the official `moodlehq/moodle-docker` environment. This setup is **for local development/testing only** and has no bearing on a real university Moodle deployment.

#### One-time Setup
Make sure you've already created the `examnet` network (see step 2 above).

1. The repository includes a script/setup inside `moodle-dev/`. First, export required environment variables:
   *(On Windows PowerShell, use `$env:MOODLE_DOCKER_WWWROOT="..\moodle"` instead of `export`)*
   ```bash
   cd moodle-dev/moodle-docker
   export MOODLE_DOCKER_WWWROOT=../moodle
   export MOODLE_DOCKER_DB=pgsql
   ```
2. Start the Moodle stack:
   ```bash
   bin/moodle-docker-compose up -d
   ```
3. Initialize the Moodle site (this provisions the database and creates the admin user):
   ```bash
   bin/moodle-docker-compose exec webserver php admin/cli/install_database.php --agree-license --fullname="Docker moodle" --shortname="docker_moodle" --summary="Docker moodle site" --adminpass="test" --adminemail="admin@example.com"
   ```

#### Accessing Moodle
Moodle will be accessible at [http://localhost:8000](http://localhost:8000).
- **Username**: `admin`
- **Password**: `test`

Since Moodle and the App both connect to the `examnet` Docker network, they can reach each other by service name. The main app container can reach Moodle at `http://webserver:8000`.

To register the application as an External Tool within Moodle:
1. Log in to Moodle at [http://localhost:8000](http://localhost:8000).
2. Go to **Site administration** -> **Plugins** -> **External tool** -> **Manage tools**.
3. Register the tool using the app's LTI launch and JWKS URLs (defined in your `.env` file).

### Note on Local Development and HTTPS
Caddy provides a clean HTTPS entry point for production deployments but requires a real public domain to automatically issue a valid SSL certificate. For pure local development where you need a valid HTTPS URL (e.g., for Moodle LTI launches), using an `ngrok` tunnel to the App service (`localhost:3000`) is still the recommended workflow.

### Testing the LTI Launch

This project uses [ltijs](https://github.com/Cvmcosta/ltijs) to implement an LTI 1.3 tool provider. The steps below walk through proving that Moodle can successfully launch into this app with a verified identity.

#### 1. Start the server

Either via Docker Compose:
```bash
docker compose up -d --build
```
Or locally for development:
```bash
npm run dev
```
The app server listens on **port 3000** by default.

#### 2. Expose the server over HTTPS with ngrok

LTI 1.3's OIDC flow requires a public HTTPS URL. Start an [ngrok](https://ngrok.com/) tunnel:
```bash
ngrok http 3000
```
Copy the `https://` forwarding URL (e.g. `https://ab12-34-56.ngrok-free.app`). This is your **`<TOOL_URL>`** for the steps below.

#### 3. Register the tool in Moodle

1. Log in to Moodle ([http://localhost:8000](http://localhost:8000)) as admin.
2. Navigate to **Site administration → Plugins → External tool → Manage tools**.
3. Click **configure a tool manually** and fill in:

| Field | Value |
|---|---|
| **Tool name** | Final Year Project (or any name) |
| **Tool URL** | `<TOOL_URL>/lti` |
| **LTI version** | LTI 1.3 |
| **Initiate login URL** | `<TOOL_URL>/lti/login` |
| **Redirection URI(s)** | `<TOOL_URL>/lti` |
| **Public keyset URL** | `<TOOL_URL>/lti/keys` |

4. Under **Services → IMS LTI Names and Role Provisioning**: choose *Use this service...* if prompted (optional for this test).
5. Under **Privacy**, set **Share launcher's name with tool** and **Share launcher's email with tool** to **Always** (so the launch page can display the user's name).
6. Save the tool.

#### 4. Copy platform details into `.env`

After saving, Moodle shows the tool's details. Copy these values into your project's `.env`:

```env
PLATFORM_URL=http://localhost:8000           # Moodle's issuer / Platform ID
PLATFORM_CLIENT_ID=<the Client ID shown>     # e.g. "abc123xyz"
PLATFORM_AUTH_ENDPOINT=http://localhost:8000/mod/lti/auth.php
PLATFORM_TOKEN_ENDPOINT=http://localhost:8000/mod/lti/token.php
PLATFORM_KEYSET_ENDPOINT=http://localhost:8000/mod/lti/certs.php
```

> **Note:** If using Docker Compose, Moodle's internal hostname may differ from the external one. Use the URL that the *browser* uses to reach Moodle for `PLATFORM_URL` and the endpoints, since ltijs communicates with Moodle via the browser redirect flow.

#### 5. Restart and test

1. Restart the server so it picks up the new env vars:
   ```bash
   docker compose up -d --build
   # or: ctrl+C and re-run npm run dev
   ```
2. In Moodle, go to any course → **Turn editing on** → **Add an activity or resource** → **External tool**.
3. Select the tool you registered, save, and click it.
4. You should land on a page showing:
   - ✓ **LTI Launch Verified**
   - The logged-in user's **name** and **role** (Student / Instructor).

If you see errors, check the server logs for details.

### Managing Data
All stateful services (MongoDB, MinIO) use persistent named volumes. 
- Running `docker compose down` will stop the services but **keep your data intact**.
- To wipe the state completely, use `docker compose down -v`.

