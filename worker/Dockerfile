FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN mkdir -p /data && chown node:node /data
USER node
ENV WORK_DIR=/data/work MEDIA_ROOT=/data/media
CMD ["npm","run","worker"]
