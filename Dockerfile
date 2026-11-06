# PromiSure AI — production image (SQLite on a mounted volume)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATABASE_URL=file:/app/data/prod.db PORT=3000
COPY --from=build /app ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
