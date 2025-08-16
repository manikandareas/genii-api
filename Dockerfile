# Gunakan Bun 1.2 (atau latest)
FROM oven/bun:1.2-alpine
WORKDIR /app

# Pastikan hanya prod deps
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]