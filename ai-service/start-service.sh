#!/bin/bash
# Start ResumeFit AI Service with PM2
# This script ensures the service runs continuously in the background

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🚀 Starting ResumeFit AI Service..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing PM2..."
    npm install -g pm2
    echo "✅ PM2 installed"
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if service is already running
if pm2 list | grep -q "resumefit-ai-service"; then
    echo "⚠️  Service is already running. Restarting..."
    pm2 restart resumefit-ai-service
else
    echo "📦 Starting new service instance..."
    pm2 start ecosystem.config.cjs
fi

# Save PM2 process list (so it persists across reboots)
pm2 save

# Setup PM2 to start on system boot (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🔧 Setting up PM2 to start on system boot..."
    pm2 startup | tail -1 | bash || echo "⚠️  Could not set up startup script. You may need to run 'pm2 startup' manually."
fi

echo ""
echo "✅ ResumeFit AI Service is now running!"
echo ""
echo "📊 Useful commands:"
echo "   View logs:        npm run pm2:logs"
echo "   Check status:     npm run pm2:status"
echo "   Stop service:     npm run pm2:stop"
echo "   Restart service:  npm run pm2:restart"
echo ""
echo "🌐 Service URL: http://localhost:3001"
echo "🏥 Health check: http://localhost:3001/health"
echo ""

