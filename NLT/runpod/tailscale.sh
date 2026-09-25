#!/usr/bin/env bash
set -euo pipefail

########################################
# Config via environment variables
########################################
: "${TS_AUTHKEY:?Set TS_AUTHKEY to your Tailscale auth key (Admin > Settings > Keys)}"
TS_HOSTNAME="${TS_HOSTNAME}"         # how the node appears in the tailnet admin
TS_ACCEPT_DNS="${TS_ACCEPT_DNS:-false}"          # usually false on servers
TS_SSH="${TS_SSH:-true}"                         # allow tailscale SSH into the pod (optional)
OLLAMA_BIND="${OLLAMA_BIND:-127.0.0.1}"          # bind to localhost only since we use Tailscale Serve
DEBUG="${DEBUG:-false}"                          # enable debug output

# Enable debug mode if requested
if [ "$DEBUG" = "true" ]; then
    set -x
    echo "[DEBUG] Debug mode enabled"
fi

echo "[+] TS_HOSTNAME=$TS_HOSTNAME"
echo "[+] OLLAMA_BIND=$OLLAMA_BIND"
echo "[+] DEBUG=$DEBUG"
echo "[+] RunPod Template Mode: Ollama will be managed by the template"

########################################
# Base deps & Container Environment Setup
########################################
echo "[+] Installing dependencies..."
apt-get update -y
apt-get install -y curl jq ca-certificates wget gnupg lsb-release iptables

# Container environment fixes for Tailscale
echo "[+] Setting up container environment for Tailscale..."

# Check container environment
echo "[+] Container environment check:"
echo "   Running as user: $(whoami) (uid=$(id -u))"
echo "   Capabilities: $(cat /proc/self/status | grep Cap || true)"
echo "   Network namespace: $(ls -la /proc/self/ns/net || true)"

# Create TUN device if it doesn't exist
if [ ! -c /dev/net/tun ]; then
    echo "[+] Creating TUN device..."
    mkdir -p /dev/net
    mknod /dev/net/tun c 10 200 2>/dev/null || echo "   TUN device creation failed (may not have permissions)"
    chmod 666 /dev/net/tun 2>/dev/null || true
fi

# Load TUN module if possible
echo "[+] Loading TUN kernel module..."
modprobe tun 2>/dev/null || echo "   TUN module load failed (expected in most container environments)"

# Verify TUN device exists
if [ -c /dev/net/tun ]; then
    echo "[+] TUN device available at /dev/net/tun"
    ls -la /dev/net/tun || true
else
    echo "[-] WARNING: TUN device not available, Tailscale will use userspace networking"
fi

# Check iptables availability (for diagnostics)
echo "[+] Checking iptables availability..."
if iptables -L >/dev/null 2>&1; then
    echo "   iptables: Available"
else
    echo "   iptables: Not available (will use netfilter-mode=off)"
fi

########################################
# Install & bring up Tailscale (no systemd)
########################################
if ! command -v tailscale >/dev/null 2>&1; then
  echo "[+] Installing Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
fi

# Check Tailscale version and availability
echo "[+] Tailscale version check:"
tailscale version || echo "   tailscale command failed"
tailscaled --version || echo "   tailscaled command failed"
which tailscaled || echo "   tailscaled not found in PATH"

# Ensure directories exist with proper permissions
echo "[+] Setting up Tailscale directories..."
mkdir -p /var/run/tailscale /var/lib/tailscale /var/log /run/tailscale
chmod 755 /var/run/tailscale /var/lib/tailscale /run/tailscale

# Kill any existing tailscaled processes to avoid conflicts
echo "[+] Cleaning up any existing tailscaled processes..."
pkill -f tailscaled || true
sleep 2

echo "[+] Starting tailscaled (no systemd)"
# Debug: Show the exact command we're about to run
echo "[DEBUG] Starting with minimal flags first..."

# Start tailscaled with minimal flags first
nohup tailscaled \
    --state=/var/lib/tailscale/tailscaled.state \
    --socket=/var/run/tailscale/tailscaled.sock \
    --tun=userspace-networking \
    >/var/log/tailscaled.log 2>&1 &

# Store PID and check if it started
TAILSCALED_PID=$!
echo "[DEBUG] tailscaled PID: $TAILSCALED_PID"
sleep 1
if kill -0 $TAILSCALED_PID 2>/dev/null; then
    echo "[DEBUG] tailscaled process is running"
else
    echo "[DEBUG] tailscaled process died immediately - checking log"
    tail -5 /var/log/tailscaled.log 2>/dev/null || true
fi

# Wait longer for tailscaled to be ready
echo "[+] Waiting for tailscaled to be ready..."
tailscaled_ready=false
for i in {1..30}; do
  # Check if tailscaled daemon is responding
  if tailscale version >/dev/null 2>&1; then
    echo "[+] tailscaled daemon is responding"
    tailscaled_ready=true
    break
  fi
  echo "   Waiting for tailscaled... ($i/30)"
  sleep 2
done

if [ "$tailscaled_ready" = "false" ]; then
  echo "[-] tailscaled daemon not responding, trying alternative startup..."
  # Kill and restart with different approach
  pkill -f tailscaled || true
  sleep 3
  
  # Just try the most basic startup
  echo "[DEBUG] Trying minimal tailscaled startup..."
  nohup tailscaled --tun=userspace-networking >/var/log/tailscaled-minimal.log 2>&1 &
  
  # Wait for minimal startup
  for i in {1..20}; do
    if tailscale version >/dev/null 2>&1; then
      echo "[+] tailscaled minimal startup successful"
      tailscaled_ready=true
      break
    fi
    echo "   Waiting for minimal tailscaled... ($i/20)"
    sleep 3
  done
  
  if [ "$tailscaled_ready" = "false" ]; then
    echo "[-] All tailscaled startup attempts failed"
    echo "---- Minimal log ----"
    tail -20 /var/log/tailscaled-minimal.log 2>/dev/null || true
    exit 1
  fi
fi
echo "[+] tailscale up"
# Retry tailscale up with exponential backoff and container-friendly options
for attempt in 1 2 3; do
  echo "   Attempt $attempt/3 to connect to Tailscale..."
  if tailscale up \
    --authkey="${TS_AUTHKEY}" \
    --hostname="${TS_HOSTNAME}" \
    --timeout=60s \
    --accept-routes=false \
    --shields-up=false \
    $( [ "$TS_ACCEPT_DNS" = "true" ] && echo "--accept-dns=true" || echo "--accept-dns=false" ) \
    $( [ "$TS_SSH" = "true" ] && echo "--ssh=true" || echo "--ssh=false" ); then
    echo "[+] Successfully connected to Tailscale"
    break
  else
    TAILSCALE_ERROR=$?
    echo "[-] Tailscale connection attempt $attempt failed (exit code: $TAILSCALE_ERROR)"
    
    # Show more detailed error info
    echo "   Checking tailscale status..."
    tailscale status 2>&1 | head -10 || true
    
    if [ $attempt -lt 3 ]; then
      echo "   Retrying in $((attempt * 5)) seconds..."
      sleep $((attempt * 5))
    else
      echo "[-] All Tailscale connection attempts failed"
      echo "---- Current tailscale status ----"
      tailscale status || true
      echo "---- /var/log/tailscaled.log (last 50 lines) ----"
      tail -n 50 /var/log/tailscaled.log || true
      if [ -f /var/log/tailscaled-retry.log ]; then
        echo "---- /var/log/tailscaled-retry.log (last 30 lines) ----"
        tail -n 30 /var/log/tailscaled-retry.log || true
      fi
      exit 1
    fi
  fi
done

# Verify Tailscale is working
echo "[+] Verifying Tailscale connection..."
for i in {1..10}; do
  if tailscale ip -4 >/dev/null 2>&1; then
    echo "[+] Tailscale is working correctly"
    break
  fi
  echo "   Waiting for Tailscale IP... ($i/10)"
  sleep 3
done

echo "[+] Tailnet IPs:"
tailscale ip -4 || true
tailscale status || true

########################################
# Check if Ollama is already running (RunPod template handles this)
########################################
echo "[+] Checking if Ollama is already running..."
if curl -fsS --connect-timeout 5 --max-time 10 "http://$OLLAMA_BIND:11434/api/tags" >/dev/null 2>&1; then
    echo "[+] Ollama API is already responding on $OLLAMA_BIND:11434"
    echo "[+] Available models:"
    curl -s "http://$OLLAMA_BIND:11434/api/tags" | jq -r '.models[].name' 2>/dev/null || echo "   (Could not list models)"
else
    echo "[-] WARNING: Ollama API is not responding on $OLLAMA_BIND:11434"
    echo "[+] Waiting for Ollama to become available (RunPod template should handle this)..."
    
    # Wait up to 2 minutes for Ollama to become available
    deadline=$(( $(date +%s) + 120 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        if curl -fsS --connect-timeout 2 --max-time 5 "http://$OLLAMA_BIND:11434/api/tags" >/dev/null 2>&1; then
            echo "[+] Ollama API is now responding!"
            break
        fi
        echo "   Waiting for Ollama... ($(( deadline - $(date +%s) ))s remaining)"
        sleep 5
    done
    
    # Final check
    if ! curl -fsS --connect-timeout 2 --max-time 5 "http://$OLLAMA_BIND:11434/api/tags" >/dev/null 2>&1; then
        echo "[-] ERROR: Ollama is still not responding after waiting"
        echo "    The RunPod template should have started Ollama automatically"
        echo "    Check if Ollama is running: ps aux | grep ollama"
        echo "    Check Ollama logs if available"
        exit 1
    fi
fi

echo "[+] Ollama is ready for Tailscale Serve setup"

########################################
# Tailscale Serve (HTTPS) -> Ollama with verification
########################################
echo "[+] Enabling Tailscale Serve: HTTPS / -> http://127.0.0.1:11434"

# Stop any existing serve first
tailscale serve reset 2>/dev/null || true
sleep 2

# Configure Tailscale Serve with retry (use 127.0.0.1 as required by Tailscale)
for attempt in 1 2 3; do
  echo "   Configuring Tailscale Serve (attempt $attempt/3)..."
  if tailscale serve --bg "http://127.0.0.1:11434"; then
    echo "[+] Tailscale Serve configured successfully"
    break
  else
    echo "[-] Tailscale Serve configuration failed"
    if [ $attempt -lt 3 ]; then
      sleep 5
    else
      echo "[-] All Tailscale Serve attempts failed"
      exit 1
    fi
  fi
done

echo "[+] Serve status:"
tailscale serve status || true

# Note: External access verification from within container may fail due to network restrictions
echo "[+] External HTTPS access setup complete"
echo "    (Verification from container may fail, but external access should work)"
TS_JSON="$(tailscale status --json 2>/dev/null || echo '{}')"
HOSTNAME=$(echo "$TS_JSON" | jq -r '.Self.HostName // empty')
DOMAIN=$(echo "$TS_JSON" | jq -r '.MagicDNSSuffix // empty')

if [ -n "$HOSTNAME" ] && [ -n "$DOMAIN" ]; then
  EXTERNAL_URL="https://${HOSTNAME}.${DOMAIN}"
  echo "    External URL will be: $EXTERNAL_URL"
  
  # Try a quick test but don't fail if it doesn't work from container
  echo "    Testing from container (may fail due to network restrictions)..."
  if timeout 10 curl -k -s --connect-timeout 3 --max-time 5 "$EXTERNAL_URL/api/tags" >/dev/null 2>&1; then
    echo "    ✓ External access verified from container!"
  else
    echo "    - External access test failed from container (normal in some environments)"
    echo "    - External access should still work from your local machine"
  fi
else
  echo "    Could not determine external URL"
fi

########################################
# Print access hints and final verification
########################################
echo ""
echo "==================== READY ===================="
# Try to print MagicDNS URL if available
TS_JSON="$(tailscale status --json 2>/dev/null || echo '{}')"
HOSTNAME=$(echo "$TS_JSON" | jq -r '.Self.HostName // empty')
DOMAIN=$(echo "$TS_JSON" | jq -r '.MagicDNSSuffix // empty')

if [ -n "$HOSTNAME" ] && [ -n "$DOMAIN" ]; then
  EXTERNAL_URL="https://${HOSTNAME}.${DOMAIN}"
  echo "Tailnet URL: $EXTERNAL_URL/"
  echo "MagicDNS: ${HOSTNAME}.${DOMAIN}"
else
  TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
  echo "Tailnet IP (HTTPS via Serve): https://$TAILSCALE_IP/"
fi

# Show available models
echo "Available models:"
curl -s "http://$OLLAMA_BIND:11434/api/tags" | jq -r '.models[].name' 2>/dev/null || echo "   (Could not list models)"

echo "Ollama API: $EXTERNAL_URL/api/tags"
echo ""
echo "Test command (replace YOUR_MODEL with an actual model name):"
if [ -n "$EXTERNAL_URL" ]; then
  echo "  curl -k '$EXTERNAL_URL/api/generate' \\"
else
  echo "  curl -k 'https://$TAILSCALE_IP/api/generate' \\"
fi
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"model\":\"YOUR_MODEL\",\"prompt\":\"hello\",\"stream\":false}'"
echo ""
echo "Process status:"
echo "  Tailscaled: $(pgrep tailscaled >/dev/null && echo 'Running' || echo 'Not running')"
echo "  Ollama: $(pgrep ollama >/dev/null && echo 'Running' || echo 'Not running')"
echo "  Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'No IP')"
echo ""
echo "Logs:"
echo "  tail -f /var/log/tailscaled.log"
echo "================================================"

# Final health check
echo "[+] Running final health checks..."
if ! pgrep tailscaled >/dev/null; then
  echo "WARNING: tailscaled is not running"
fi

if ! pgrep ollama >/dev/null; then
  echo "WARNING: ollama is not running (RunPod template should handle this)"
fi

if ! tailscale ip -4 >/dev/null 2>&1; then
  echo "WARNING: No Tailscale IP assigned"
fi

echo "Setup complete! Tailscale Serve is now proxying your existing Ollama server."

# Script complete - can exit gracefully since RunPod template handles container lifecycle
echo "[+] Tailscale Serve setup complete"
echo "Container will remain running via RunPod template management."
echo ""
echo "To monitor services:"
echo "  - Check Tailscale status: tailscale status"
echo "  - Check Ollama: curl http://127.0.0.1:11434/api/tags"
echo "  - Check logs: tail -f /var/log/tailscaled.log"
echo ""
echo "Tailscale Init script finished successfully!"