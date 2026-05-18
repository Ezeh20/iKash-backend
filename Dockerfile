# Use a build stage to install dependencies, generate Prisma client, and compile TypeScript
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# Copy package metadata and install all dependencies required for the build
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

RUN npm install

# Copy application source and Prisma schema for build
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client and build the app
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:22-slim AS runner
WORKDIR /usr/src/app

# Copy only production dependencies and built output
COPY package.json ./
COPY pnpm-lock.yaml* ./
RUN npm install --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

# Cloud Run will provide PORT via environment variable
EXPOSE 3000
CMD ["node", "dist/main"]
