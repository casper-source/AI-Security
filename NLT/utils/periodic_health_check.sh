#!/bin/bash

# Periodic Model Health Monitor
# Add to crontab: */30 * * * * /path/to/periodic_health_check.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/health_monitor.log"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

echo "$(date): Running periodic health check" >> "$LOG_FILE"

# Check if Ollama is running
if ! pgrep -f "ollama serve" > /dev/null; then
    echo "$(date): Ollama not running, skipping health check" >> "$LOG_FILE"
    exit 0
fi

# Run health check
if "$SCRIPT_DIR/model_health_checker.sh" llama3.2:3b >> "$LOG_FILE" 2>&1; then
    echo "$(date): Health check passed" >> "$LOG_FILE"
else
    echo "$(date): Health check failed - model may have been repaired" >> "$LOG_FILE"
    
    # Optional: Send notification (uncomment if you want email alerts)
    # echo "Model corruption detected and repaired on $(hostname)" | mail -s "NLT Chatbot Alert" user@example.com
fi

# Keep log file size manageable (keep last 1000 lines)
tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
