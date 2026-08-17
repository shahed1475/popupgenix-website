# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.scripts.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm run build:scripts

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-scripts ./dist-scripts
COPY db ./db
RUN chown -R node:node /app
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
