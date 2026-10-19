FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "server/proxy.js"]
