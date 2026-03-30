# ═══════════════════════════════════════════════════════════════
# FacturaCL — Dockerfile multi-stage
# Stage 1: build del frontend con Vite
# Stage 2: imagen de producción mínima (solo el servidor)
#
# Compatible con Railway (detección automática) y Azure Container Apps
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build del frontend ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar solo los manifests primero (aprovecha cache de Docker)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copiar el código fuente
COPY src/       ./src/
COPY vite.config.js ./

# Build del frontend
RUN npm run build

# ── Stage 2: Servidor de producción ──────────────────────────
FROM node:20-alpine AS production

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S facturacl -u 1001

WORKDIR /app

# Solo las dependencias de producción
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Copiar el servidor
COPY server/ ./server/

# Copiar el build del frontend desde el stage anterior
COPY --from=builder /app/dist ./dist

# Cambiar al usuario no-root
USER facturacl

# Puerto (Railway lo sobreescribe con $PORT)
EXPOSE 3000

# Health check para Docker/Azure
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Arrancar
CMD ["node", "server/index.js"]
