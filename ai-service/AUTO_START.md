# Auto-Start Guide: Keep AI Service Running Continuously

This guide shows you how to keep the ResumeFit AI Service running automatically, so you don't have to manually start it each time.

## Quick Start (Recommended)

### Option 1: Using PM2 (Easiest - Recommended)

PM2 is a process manager that keeps your service running in the background and automatically restarts it if it crashes.

#### Step 1: Install PM2 (if not already installed)

```bash
npm install -g pm2
```

#### Step 2: Start the Service

```bash
cd /Users/mahajans/ResumeFit/ai-service
./start-service.sh
```

Or manually:

```bash
cd /Users/mahajans/ResumeFit/ai-service
npm run pm2:start
```

#### Step 3: Set PM2 to Start on System Boot (macOS)

```bash
pm2 startup
# Follow the instructions it prints
pm2 save
```

That's it! The service will now:
- ✅ Run in the background
- ✅ Auto-restart if it crashes
- ✅ Start automatically when you reboot your computer
- ✅ Keep running even if you close the terminal

#### Useful PM2 Commands

```bash
# View logs
npm run pm2:logs
# or
pm2 logs resumefit-ai-service

# Check status
npm run pm2:status
# or
pm2 status

# Restart service
npm run pm2:restart
# or
pm2 restart resumefit-ai-service

# Stop service
npm run pm2:stop
# or
pm2 stop resumefit-ai-service

# Remove service from PM2
npm run pm2:delete
# or
pm2 delete resumefit-ai-service
```

### Option 2: Using macOS LaunchAgent (Native macOS)

This creates a system service that starts automatically on boot.

#### Step 1: Create LaunchAgent File

```bash
cd /Users/mahajans/ResumeFit/ai-service
cat > ~/Library/LaunchAgents/com.resumefit.ai-service.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.resumefit.ai-service</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/mahajans/ResumeFit/ai-service/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/mahajans/ResumeFit/ai-service</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/mahajans/ResumeFit/ai-service/logs/launchd-out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/mahajans/ResumeFit/ai-service/logs/launchd-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF
```

**Note:** Update the paths in the plist file to match your system:
- Replace `/usr/local/bin/node` with the output of `which node`
- Update the paths to match your actual installation

#### Step 2: Load the Service

```bash
launchctl load ~/Library/LaunchAgents/com.resumefit.ai-service.plist
```

#### Step 3: Start the Service

```bash
launchctl start com.resumefit.ai-service
```

#### Useful LaunchAgent Commands

```bash
# Check if service is running
launchctl list | grep resumefit

# Stop service
launchctl stop com.resumefit.ai-service

# Start service
launchctl start com.resumefit.ai-service

# Unload service (remove from auto-start)
launchctl unload ~/Library/LaunchAgents/com.resumefit.ai-service.plist
```

### Option 3: Simple Background Script (Quick & Dirty)

If you just want it running in the background without auto-restart:

```bash
cd /Users/mahajans/ResumeFit/ai-service
nohup npm start > logs/background.log 2>&1 &
```

This runs it in the background, but won't auto-restart on crashes or system reboots.

## Verify It's Running

Check the service status:

```bash
curl http://localhost:3001/health
```

Should return: `{"status":"ok","service":"ResumeFit AI Service"}`

## Troubleshooting

### Service Not Starting

1. **Check if port 3001 is already in use:**
   ```bash
   lsof -i :3001
   ```

2. **Check logs:**
   - PM2: `pm2 logs resumefit-ai-service`
   - LaunchAgent: `cat ~/Library/LaunchAgents/com.resumefit.ai-service.plist`

3. **Check if Node.js is in PATH:**
   ```bash
   which node
   ```

### Service Crashes Frequently

1. **Check memory usage:**
   ```bash
   pm2 monit
   ```

2. **Increase memory limit in `ecosystem.config.js`:**
   ```javascript
   max_memory_restart: '2G', // Increase from 1G
   ```

3. **Check ChromaDB is running:**
   ```bash
   curl http://localhost:8000/api/v1/heartbeat
   ```

## Recommended Setup

For best results, use **PM2 (Option 1)** because it:
- ✅ Handles crashes automatically
- ✅ Provides easy log viewing
- ✅ Works across platforms
- ✅ Easy to manage
- ✅ Can monitor resource usage

## Next Steps

Once the service is running continuously:

1. ✅ Test it in the extension
2. ✅ Check logs periodically: `npm run pm2:logs`
3. ✅ Monitor status: `npm run pm2:status`

The service will now be available whenever you use the extension!

