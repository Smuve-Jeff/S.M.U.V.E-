# The relay has no npm dependencies: Node plus ffmpeg is the whole runtime.
FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    RELAY_PORT=8080

EXPOSE 8080
CMD ["node", "src/main.mjs"]
