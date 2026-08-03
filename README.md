# Final Year Project

This repository contains a Dockerized exam platform with an Express app, MongoDB, MinIO, and a Caddy reverse proxy. The complete cold-start walkthrough lives in [SETUP.md](SETUP.md).

If you are starting from zero, follow [SETUP.md](SETUP.md) end to end. It covers:

- the app stack in this repo
- the MoodleHQ-based local Moodle/LTI environment
- external tool registration
- the platform values that must be copied into `server/.env`
- how to reset the system safely on the same or a different device

For day-to-day development, the app listens on port 3000 and the Moodle dev stack uses the MoodleHQ `moodle-docker` wrapper under `moodle-dev/moodle-docker`.
