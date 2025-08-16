FROM oven/bun:1.2-alpine  # atau :latest jika 1.2 tidak tersedia
WORKDIR /app

# Pastikan hanya prod deps
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]