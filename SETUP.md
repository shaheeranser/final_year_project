# Setup from Scratch

This document is the canonical cold-start guide for the full local environment. Follow the steps in order. They are written so a human developer or an AI coding agent can reconstruct the entire setup without prior context.

## 1. Prerequisites

Install the following before doing anything else:

1. Docker Engine.
2. Docker Compose v2, available as `docker compose`.
3. A tunnel tool that gives you a stable public HTTPS URL for local development, such as `ngrok` or `cloudflared`.
4. Git.

You will need the tunnel because Moodle LTI 1.3 launches require a public HTTPS origin. A plain `localhost` URL is not enough for the external tool registration.

## 2. Clone the repo and configure the app environment

Clone the repository and create the runtime env file that the app stack actually reads:

```bash
git clone <repo-url> final_year_project
cd final_year_project
cp .env.example server/.env
```

The root `.env.example` is the template source, but `docker-compose.yml` reads `server/.env` for the app, MongoDB, and MinIO containers. If you also want a root-level copy for reference, you can create one, but it is not the file the containers consume.

Open `server/.env` and make sure the following are set:

1. `PORT=3000`
2. `MONGO_URI=mongodb://mongo:27017/incident_db`
3. `MINIO_*` values that match the compose file defaults unless you intentionally change them.
4. `LTI_ENCRYPTION_KEY` is a real non-empty value. If you want a fresh key, generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Leave the `PLATFORM_*` variables blank for now. They are filled in after Moodle registration in step 10.

## 3. Create the shared `examnet` Docker network

The compose file declares `examnet` as an external network, so Docker will not auto-create it. Create it once on each machine:

```bash
docker network inspect examnet >/dev/null 2>&1 || docker network create examnet
```

If the network already exists, the command is a no-op.

## 4. Bring up the main stack

From the repository root, start the application stack:

```bash
docker compose up -d --build
```

The first start should bring up these services:

1. `app`
2. `mongo`
3. `minio`
4. `minio-init`
5. `reverse-proxy` (Caddy)

The `minio-init` container runs once to create the bucket and then exits successfully.

To confirm the services are running:

```bash
docker compose ps
```

## 5. Recreate the Moodle dev environment with MoodleHQ tooling

The `moodle-dev/` directory is intentionally gitignored and not vendored, so a fresh device must rebuild it locally. Use MoodleHQ’s own `moodle` and `moodle-docker` repositories, not Bitnami images.

Bitnami’s free Moodle image tags were deprecated and paywalled in 2025, so they are not the supported path here.

Create the local Moodle checkout and wrapper workspace:

```bash
mkdir -p moodle-dev
git clone https://github.com/moodlehq/moodle.git moodle-dev/moodle
git clone https://github.com/moodlehq/moodle-docker.git moodle-dev/moodle-docker
cd moodle-dev/moodle-docker
export MOODLE_DOCKER_WWWROOT=../moodle
export MOODLE_DOCKER_DB=pgsql
cp config.docker-template.php ../moodle/config.php
```

This regenerates the local Moodle dev tree that the wrapper scripts expect.

## 6. Configure and start Moodle with the wrapper script

Still inside `moodle-dev/moodle-docker`, start the Moodle containers:

```bash
bin/moodle-docker-compose up -d
bin/moodle-docker-wait-for-db
```

The default Moodle web entry point is `http://localhost:8000`.

If you stop the containers later without destroying volumes, you can restart them with the same wrapper:

```bash
bin/moodle-docker-compose start
```

## 7. Run the one-time Moodle site initialization

This step creates the Moodle site and admin account for a fresh database. Run it only once per new database. Do not repeat it on every restart.

```bash
bin/moodle-docker-compose exec webserver php admin/cli/install_database.php --agree-license --fullname="Docker moodle" --shortname="docker_moodle" --summary="Docker moodle site" --adminpass="test" --adminemail="admin@example.com"
```

After that, log in at `http://localhost:8000` with:

1. Username: `admin`
2. Password: `test`

If you destroy the Moodle volumes or rebuild the database from scratch, run the install step again.

## 8. Create test data in Moodle

Create a minimal LTI test dataset in the Moodle UI:

1. Log in as `admin`.
2. Create a course, for example `LTI Sandbox`.
3. Create at least one teacher account, for example `teacher1`.
4. Create at least one student account, for example `student1`.
5. Open the course and use **Participants** -> **Enrol users**.
6. Enrol the teacher with the **Teacher** or **Editing teacher** role.
7. Enrol each student with the **Student** role.

Keep the teacher and student accounts simple so you can use Moodle’s **Log in as** feature later instead of remembering separate passwords.

## 9. Register the tool as an LTI 1.3 external tool in Moodle

Go to **Site administration** -> **Plugins** -> **External tool** -> **Manage tools** and choose **Configure a tool manually**.

Important: the default version dropdown usually starts on **LTI 1.0/1.1**. Change it to **LTI 1.3** first. If you skip that step, Moodle shows the wrong fields, such as **Consumer key** and **Shared secret**, instead of the LTI 1.3 fields you need.

Fill the manual tool form with the following values:

1. **Tool name**: any helpful label, for example `Final Year Project`.
2. **Tool URL**: `<TOOL_URL>/lti`
3. **LTI version**: `LTI 1.3`
4. **Initiate login URL**: `<TOOL_URL>/lti/login`
5. **Redirect URI(s)**: `<TOOL_URL>/lti`
6. **Public key type**: `Keyset URL`
7. **Keyset URL**: `<TOOL_URL>/lti/keys`

Here, `<TOOL_URL>` is the public HTTPS URL from your tunnel tool. For example, if your tunnel forwards to port 3000, use the forwarded `https://...` URL as the base.

If you want launch pages to show the person’s name and email, also set the privacy options to share the launcher's name and email with the tool.

Save the tool after filling those fields.

## 10. Copy the platform-generated values into `server/.env`

After saving the external tool, Moodle shows the platform details you must copy back into the app config.

Put them in `server/.env` exactly as follows:

```env
PLATFORM_URL=<Platform ID / issuer URL shown by Moodle>
PLATFORM_CLIENT_ID=<Client ID shown by Moodle>
PLATFORM_AUTH_ENDPOINT=<Authorization endpoint shown by Moodle>
PLATFORM_TOKEN_ENDPOINT=<Token endpoint shown by Moodle>
PLATFORM_KEYSET_ENDPOINT=<Keyset endpoint shown by Moodle>
```

Use the values shown in Moodle’s external tool settings after saving. In practice, they usually map to URLs like these:

1. `PLATFORM_AUTH_ENDPOINT` -> `.../mod/lti/auth.php`
2. `PLATFORM_TOKEN_ENDPOINT` -> `.../mod/lti/token.php`
3. `PLATFORM_KEYSET_ENDPOINT` -> `.../mod/lti/certs.php`

The important rule is to copy the exact values Moodle shows for the current site and current tunnel URL.

## 11. Restart the app so `registerPlatform` picks up the new config

The app reads `server/.env` at container start, so you must recreate the app container after filling in the `PLATFORM_*` values.

```bash
docker compose up -d --force-recreate app
```

If you changed code as well as env vars, use:

```bash
docker compose up -d --build --force-recreate app
```

Watch the logs while the app comes back up:

```bash
docker compose logs -f app
```

You want to see the platform registration succeed and no startup errors.

## 12. Test a full launch as teacher and student

Use Moodle’s **Log in as** feature so you do not need separate passwords for every test account.

1. Log in as `admin`.
2. Open the course you created.
3. Use **Participants** or the user profile menu to **Log in as** the teacher user.
4. Add or launch the registered external tool from the course and confirm the teacher landing page opens.
5. Return to admin, then **Log in as** the student user.
6. Launch the same external tool again and confirm the student landing page opens.

Keep `docker compose logs -f app` open during both launches and confirm there are no startup or launch errors.

## 13. Known gotchas

1. MongoDB restart loops can happen if the image tag and healthcheck expectations drift. If the `mongo` service keeps restarting, inspect the healthcheck and the image tag together before assuming the app is broken.
2. Bitnami’s free Moodle image tags were deprecated/paywalled in 2025. Use MoodleHQ’s `moodle-docker` workflow instead.
3. The Moodle external tool version dropdown defaults to `LTI 1.0/1.1`. Switch it to `LTI 1.3` before filling in the manual registration form.
4. Free-tier tunnel URLs often change after a restart. If your tunnel URL changes, update the Moodle tool registration and the `PLATFORM_*` values in `server/.env` before testing again.

## Resetting to a clean state

Use the right reset path for the situation. Same-device restarts and brand-new-device setups are not the same thing.

### A. Restarting the existing stack on the same device

If you did not run `docker compose down -v`, your data volumes still exist. In that case, you do not need to reinstall Moodle or re-create the test data.

```bash
docker compose up -d
```

If Moodle was already started through the wrapper, bring it back with:

```bash
cd moodle-dev/moodle-docker
bin/moodle-docker-compose start
```

Use this path when you only need to recover from a stop/restart and want to keep the existing MongoDB, MinIO, and Moodle databases.

### B. Setting up on a new or different device

Run the full sequence from the top of this document again.

That means:

1. Recreate `server/.env` from `.env.example`.
2. Recreate `examnet`.
3. Bring up the main Docker stack.
4. Rebuild `moodle-dev/` with MoodleHQ’s repositories.
5. Start Moodle with `moodle-docker`.
6. Run the one-time Moodle install.
7. Recreate the course, teacher, and student data.
8. Re-register the external tool because the platform values are fresh on the new device.

This full rebuild is required because `moodle-dev/` is not vendored in git and each device gets a fresh Moodle database.
