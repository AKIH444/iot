# Use Node.js base image
FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency definitions and install
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose Render's default dynamic port
EXPOSE 10000

# Start server
CMD ["npm", "start"]
