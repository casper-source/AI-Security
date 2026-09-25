#!/bin/sh

# Keep-alive script to prevent remote Ollama model from unloading
# Runs every 5 minutes (300 seconds)

echo "Starting Ollama keep-alive service..."
apk add --no-cache curl jq

while true; do
    echo "[$(date)] Sending keep-alive to remote Ollama..."
    
    curl -s -X POST https://ollama-lab.tail21af23.ts.net/api/generate \
        -H "Content-Type: application/json" \
        -d '{"model":"mixtral:8x22b","prompt":"ping","stream":false,"options":{"num_predict":1}}' \
        --connect-timeout 10 \
        --max-time 60 > /tmp/keepalive.log 2>&1
    
    if [ $? -eq 0 ]; then
        echo "Keep-alive successful"
    else
        echo "Keep-alive failed, will retry in 5 minutes"
        cat /tmp/keepalive.log 2>/dev/null || true
    fi
    
    sleep 300  # 5 minutes
done