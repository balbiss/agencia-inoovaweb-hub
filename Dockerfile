# ─────────────────────────────────────────────────────────────────────────────
# oauth-hub — imagem Docker (multi-stage).
#   Stage 1 (builder): instala deps completas e compila TypeScript → dist/.
#   Stage 2 (runtime): só deps de produção + dist/ + assets estáticos.
# Dados persistentes ficam em /app/data — monte um volume para não perdê-los.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# node-pty (devDependency, usado só pelo terminal de demo) tem addon nativo:
# precisa de python3/make/g++ para o node-gyp compilar durante o npm ci.
RUN apk add --no-cache python3 make g++

# Instala TODAS as dependências (inclui devDependencies, necessárias p/ o tsc).
COPY package.json package-lock.json ./
RUN npm ci

# Compila o TypeScript (src/ → dist/).
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Apenas dependências de produção.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Código compilado + assets lidos em runtime (public/ e locales/ são lidos por
# fs a partir de /app, ou seja __dirname(/app/dist)/.. — precisam existir).
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY locales ./locales

# Diretório de dados persistentes (apps/canais/eventos/settings em JSON).
# Criado com dono "node" para o processo não-root poder gravar no volume montado.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

# Porta HTTP interna (a porta exposta no host pode ser remapeada no compose/run).
EXPOSE 3300

# Roda como usuário não-root.
USER node

# Healthcheck no endpoint /health (respeita a env PORT; usa o fetch nativo do Node 20).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
