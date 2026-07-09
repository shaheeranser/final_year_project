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

### Managing Data
All stateful services (MongoDB, MinIO) use persistent named volumes. 
- Running `docker compose down` will stop the services but **keep your data intact**.
- To wipe the state completely, use `docker compose down -v`.
