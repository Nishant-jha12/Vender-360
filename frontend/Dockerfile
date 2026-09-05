# Vendor360 frontend: build with Node, serve the static output with nginx.
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Fonts are self-hosted; fetch them at build time so the running app never
# contacts a third party. Failure is not fatal -- the CSS falls back to the
# system font stack.
RUN npm run fonts || echo "Font fetch skipped; falling back to system fonts."

ARG VITE_API_URL=http://127.0.0.1:8000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build


FROM nginx:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
