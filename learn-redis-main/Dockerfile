# Production Dockerfile for Redis Learning Server
FROM node:20-alpine AS runner

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
