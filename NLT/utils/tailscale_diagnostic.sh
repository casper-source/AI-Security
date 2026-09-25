#!/bin/bash

# Quick Tailscale diagnostic script for container environments

echo "🔍 Tailscale Container Diagnostics"
echo "=================================="

echo "📋 Environment Check:"
echo "  - Container ID: $(hostname)"
echo "  - User: $(whoami)"
echo "  - TUN device: $([ -c /dev/net/tun ] && echo '✅ Available' || echo '❌ Missing')"
echo "  - TUN permissions: $(ls -l /dev/net/tun 2>/dev/null || echo 'N/A')"

echo ""
echo "🔧 Process Status:"
echo "  - tailscaled: $(pgrep -f tailscaled >/dev/null && echo '✅ Running' || echo '❌ Not running')"
if pgrep -f tailscaled >/dev/null; then
    echo "    PID: $(pgrep -f tailscaled)"
    echo "    Command: $(ps -p $(pgrep -f tailscaled) -o cmd --no-headers 2>/dev/null || echo 'N/A')"
fi

echo ""
echo "📡 Tailscale Status:"
if tailscale status >/dev/null 2>&1; then
    echo "  ✅ Tailscale is responding"
    tailscale status | head -5
    echo "  IP: $(tailscale ip -4 2>/dev/null || echo 'No IP assigned')"
else
    echo "  ❌ Tailscale not responding"
    echo "  Error: $(tailscale status 2>&1 | head -3)"
fi

echo ""
echo "📝 Recent Logs:"
if [ -f /var/log/tailscaled.log ]; then
    echo "  Last 5 lines from tailscaled.log:"
    tail -5 /var/log/tailscaled.log | sed 's/^/    /'
fi

echo ""
echo "💡 Manual Commands to Try:"
echo "  1. Check daemon: tailscale status"
echo "  2. Manual start: tailscaled --tun=userspace-networking &"
echo "  3. Connect: tailscale up --authkey=\$TS_AUTHKEY --hostname=\$TS_HOSTNAME"
echo "  4. Check logs: tail -f /var/log/tailscaled.log"