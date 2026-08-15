#!/bin/bash

set -e

# EC2 Deployment Script for Final Year Project
# This script sets up Docker, clones the repo (if not present),
# sets up MoodleHQ dev tools, and starts both stacks using nip.io domains.

echo "=========================================="
echo "Starting EC2 Deployment Setup"
echo "=========================================="

# 1. Update and install dependencies
echo "[1/6] Installing dependencies..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git jq

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add current user to docker group (might require a relogin, but we'll use sudo if needed or newgrp)
    sudo usermod -aG docker $USER
fi

# 2. Determine Public IP
echo "[2/6] Detecting Public IP..."
# AWS specific metadata token and IP fetch (works on EC2)
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)
if [ -n "$TOKEN" ]; then
    PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
else
    # Fallback to an external service if not on AWS or IMDSv2 fails
    PUBLIC_IP=$(curl -s ifconfig.me)
fi

if [ -z "$PUBLIC_IP" ]; then
    echo "Error: Could not determine public IP."
    exit 1
fi

export APP_DOMAIN="app.${PUBLIC_IP}.nip.io"
export MOODLE_DOMAIN="moodle.${PUBLIC_IP}.nip.io"
echo "App Domain: $APP_DOMAIN"
echo "Moodle Domain: $MOODLE_DOMAIN"

# 3. Setup Project Repository
echo "[3/6] Setting up project repository..."
PROJECT_DIR="$HOME/final_year_project"

# If the script is being run from inside an existing checkout, we use it.
if [ -f "docker-compose.yml" ] && [ -f "package.json" ]; then
    PROJECT_DIR=$(pwd)
    echo "Using current directory as project root: $PROJECT_DIR"
elif [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Please clone the repository first or run this script from inside the project."
    echo "Example: git clone <repo> final_year_project && cd final_year_project && bash scripts/deploy-ec2.sh"
    exit 1
fi

cd "$PROJECT_DIR"

# 4. Configure Application Environment
echo "[4/6] Configuring application environment..."
if [ ! -f "server/.env" ]; then
    cp .env.example server/.env
fi

# Ensure LTI_ENCRYPTION_KEY is set
if grep -q "CHANGE_ME_random_placeholder_abc123" "server/.env"; then
    RANDOM_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)
    sed -i "s/CHANGE_ME_random_placeholder_abc123/$RANDOM_KEY/g" server/.env
fi

# Ensure .env exists in project root for Docker Compose variables
cat << EOF > .env
APP_DOMAIN=$APP_DOMAIN
MOODLE_DOMAIN=$MOODLE_DOMAIN
EOF

# 5. Setup Moodle Dev Environment
echo "[5/6] Setting up MoodleHQ Docker..."
if [ ! -d "moodle-dev/moodle" ]; then
    mkdir -p moodle-dev
    git clone --depth 1 https://github.com/moodle/moodle.git moodle-dev/moodle
    git clone --depth 1 https://github.com/moodlehq/moodle-docker.git moodle-dev/moodle-docker
    
    cd moodle-dev/moodle-docker
    cp config.docker-template.php ../moodle/config.php
    
    # Update Moodle config to trust proxy headers from Caddy
    # Caddy will pass X-Forwarded-Proto and X-Forwarded-Host
    echo "// Additional configuration for EC2 Reverse Proxy
\$CFG->sslproxy = true;
\$CFG->reverseproxy = true;
" >> ../moodle/config.php

    cd "$PROJECT_DIR"
fi

# Create shared network
sudo docker network inspect examnet >/dev/null 2>&1 || sudo docker network create examnet

# 6. Start the Stacks
echo "[6/6] Starting services..."

# Start Moodle
cd "$PROJECT_DIR/moodle-dev/moodle-docker"
export MOODLE_DOCKER_WWWROOT=../moodle
export MOODLE_DOCKER_DB=pgsql
# Explicitly use sudo docker compose if user is not in docker group properly yet
sudo -E bin/moodle-docker-compose up -d

# Wait for Moodle DB (optional, but good practice)
echo "Waiting for Moodle Database to initialize..."
sleep 15

# Start App Stack
cd "$PROJECT_DIR"
sudo -E docker compose up -d --build

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Run Moodle Database installation (ONLY ONCE for a fresh DB):"
echo "   cd moodle-dev/moodle-docker && sudo -E bin/moodle-docker-compose exec webserver php admin/cli/install_database.php --agree-license --fullname=\"EC2 Moodle\" --shortname=\"ec2_moodle\" --summary=\"EC2 Moodle\" --adminpass=\"test\" --adminemail=\"admin@example.com\""
echo ""
echo "2. Access your applications:"
echo "   App:    https://$APP_DOMAIN"
echo "   Moodle: https://$MOODLE_DOMAIN"
echo ""
echo "3. Complete LTI Registration in Moodle using the App URL, then update server/.env with PLATFORM_* vars and restart the app:"
echo "   sudo -E docker compose up -d --force-recreate app"
echo "=========================================="
