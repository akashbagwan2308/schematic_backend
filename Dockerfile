# Use a lightweight Debian-based Node image
FROM node:20-bookworm-slim

# Install Yosys from the standard Debian repositories
RUN apt-get update && \
    apt-get install -y yosys && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your backend code (server.js)
COPY . .

# Expose the port Render will use
EXPOSE 3000

# Start the Node.js server
CMD ["npm", "start"]