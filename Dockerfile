

FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npm install express ws cors

COPY server.js .

EXPOSE 10000

CMD ["npm", "start"]
