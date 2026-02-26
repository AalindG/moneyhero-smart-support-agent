# Build stage for native dependencies
FROM node:18-alpine

# Install build dependencies for native modules (hnswlib-node, better-sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
