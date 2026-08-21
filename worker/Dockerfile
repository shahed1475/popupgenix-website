# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --include=dev is required here: npm ci treats NODE_ENV=production (set above) as an
# implicit --omit=dev, but task:*:dev and enqueue-csv-import run via tsx directly against
# src/ (this package's existing convention — no separate scripts build step), so tsx must
# be present at runtime.
RUN npm ci --include=dev
COPY --from=build /app/dist ./dist
COPY src ./src
COPY scripts ./scripts
RUN chown -R node:node /app
USER node
# No long-running default: this image is invoked on demand, not left running.
#   docker compose run --rm drickly-worker npm run task:research
#   docker compose run --rm drickly-worker npm run task:lead_finder
#   docker compose run --rm drickly-worker npm run enqueue-csv-import -- <org-id> <source-id> <csv-path>
CMD ["node", "-e", "console.log('drickly-worker image ready. Invoke a task explicitly, e.g.: docker compose run --rm drickly-worker npm run task:research')"]
