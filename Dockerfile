# Stage 1: Build client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production server
FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies for the server
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built server and client assets
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/dist ./client/dist

# Set working directory to server so the start script runs in the correct context
WORKDIR /app/server

# Expose the API and Frontend port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
