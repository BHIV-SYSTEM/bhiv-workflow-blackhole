# Stage 1: Build the Vite + React application
FROM node:18-alpine AS build

WORKDIR /app

# Copy package configuration files
COPY client/package*.json ./

# Install dependencies (using clean-install)
RUN npm install --legacy-peer-deps

# Copy the rest of the application files
COPY client/ .

# Accept public API URL as a build argument (baked into the Vite bundle at build time)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Accept PRANA Bucket URL as a build argument
ARG VITE_PRANA_BUCKET_URL
ENV VITE_PRANA_BUCKET_URL=$VITE_PRANA_BUCKET_URL

# Build the production bundle
RUN npm run build

# Stage 2: Serve the production assets with Nginx
FROM nginx:1.25-alpine

# Copy a custom Nginx configuration to support SPA routing (React Router fallback)
COPY NGINX/nginx.conf /etc/nginx/conf.d/default.conf

# Copy build assets from stage 1 to the web server root
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
