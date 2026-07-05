FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5177 \
    KB_PROJECT_ROOT=/data/ai-lib \
    KB_ROOT=/data/ai-lib/knowledge-base

COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY server/config/model.config.example.json ./server/config/model.config.example.json
COPY server/config/kb.paths.example.json ./server/config/kb.paths.example.json

RUN addgroup -S fuxi \
  && adduser -S fuxi -G fuxi \
  && mkdir -p /app/logs /data/ai-lib/knowledge-base \
  && chown -R fuxi:fuxi /app /data

USER fuxi

EXPOSE 5177

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const headers=process.env.BASIC_AUTH?{Authorization:'Basic '+Buffer.from(process.env.BASIC_AUTH).toString('base64')}:{}; fetch('http://127.0.0.1:5177/api/health',{headers}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
