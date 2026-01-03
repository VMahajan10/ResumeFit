#!/bin/bash
# Stop ResumeFit AI Service

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🛑 Stopping ResumeFit AI Service..."

if pm2 list | grep -q "resumefit-ai-service"; then
    pm2 stop resumefit-ai-service
    echo "✅ Service stopped"
else
    echo "⚠️  Service is not running"
fi

