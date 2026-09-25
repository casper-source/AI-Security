#!/bin/bash

echo "🛑 Stopping NLT Chatbot Hybrid Mode..."
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${2}${1}${NC}"
}

# Check if we're in the right directory
if [[ ! -f "docker-compose.hybrid.yml" ]]; then
    print_status "❌ docker-compose.hybrid.yml not found. Please run from the nlt_chatbot directory" $RED
    exit 1
fi

# Stop containerized services
print_status "🐳 Stopping containerized services..." $BLUE
if sudo docker compose -f docker-compose.hybrid.yml down; then
    print_status "✅ Containerized services stopped successfully" $GREEN
else
    print_status "⚠️  Issues stopping containers (may have already been stopped)" $YELLOW
fi

# Check if native Ollama is running
print_status "🔍 Checking native Ollama status..." $BLUE
if systemctl --user is-active --quiet ollama 2>/dev/null; then
    print_status "🛑 Stopping native Ollama service..." $BLUE
    if systemctl --user stop ollama; then
        print_status "✅ Native Ollama stopped successfully" $GREEN
    else
        print_status "❌ Failed to stop native Ollama service" $RED
    fi
elif pgrep -f "ollama serve" > /dev/null 2>&1; then
    print_status "🛑 Stopping manually started Ollama..." $BLUE
    pkill -f "ollama serve"
    sleep 2
    if ! pgrep -f "ollama serve" > /dev/null 2>&1; then
        print_status "✅ Native Ollama stopped successfully" $GREEN
    else
        print_status "❌ Failed to stop native Ollama process" $RED
    fi
else
    print_status "ℹ️  Native Ollama was not running" $BLUE
fi

# Check for any remaining Ollama processes
print_status "🔍 Checking for remaining Ollama processes..." $BLUE
ollama_pids=$(pgrep -f "ollama" 2>/dev/null)
if [[ -n "$ollama_pids" ]]; then
    print_status "⚠️  Found remaining Ollama processes: $ollama_pids" $YELLOW
    print_status "🔪 Terminating remaining processes..." $BLUE
    pkill -f "ollama" 2>/dev/null
    sleep 2
    
    # Force kill if still running
    if pgrep -f "ollama" > /dev/null 2>&1; then
        print_status "💥 Force killing stubborn Ollama processes..." $YELLOW
        pkill -9 -f "ollama" 2>/dev/null
    fi
    
    if ! pgrep -f "ollama" > /dev/null 2>&1; then
        print_status "✅ All Ollama processes terminated" $GREEN
    else
        print_status "❌ Some Ollama processes may still be running" $RED
    fi
else
    print_status "✅ No Ollama processes found" $GREEN
fi

# Verify ports are free
print_status "🔍 Verifying ports are free..." $BLUE

# Check port 5000 (Flask app)
if curl -s --connect-timeout 2 http://localhost:5000/api/health > /dev/null 2>&1; then
    print_status "⚠️  Port 5000 still responding" $YELLOW
else
    print_status "✅ Port 5000 is free" $GREEN
fi

# Check port 11434 (Ollama)
if curl -s --connect-timeout 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
    print_status "⚠️  Port 11434 still responding" $YELLOW
else
    print_status "✅ Port 11434 is free" $GREEN
fi

# Show final container status
print_status "🐳 Final container status:" $BLUE
container_status=$(sudo docker compose -f docker-compose.hybrid.yml ps --format "table {{.Name}}\t{{.State}}" 2>/dev/null)
if [[ -n "$container_status" ]] && [[ "$container_status" != *"NAME"* ]]; then
    echo "$container_status"
else
    print_status "   No containers running" $GREEN
fi

# Show Ollama service status
print_status "🤖 Ollama service status:" $BLUE
ollama_status=$(systemctl --user is-active ollama 2>/dev/null)
case "$ollama_status" in
    "active")
        print_status "   Status: Running" $YELLOW
        ;;
    "inactive")
        print_status "   Status: Stopped" $GREEN
        ;;
    "failed")
        print_status "   Status: Failed" $RED
        ;;
    *)
        print_status "   Status: Unknown" $BLUE
        ;;
esac

print_status "🎉 Hybrid shutdown complete!" $GREEN
echo ""
echo "==========================================="
echo "📊 Summary:"
echo "   • Containerized services: Stopped"
echo "   • Native Ollama: Stopped"
echo "   • Ports 5000 & 11434: Should be free"
echo ""
echo "💡 To restart:"
echo "   • Hybrid mode: ./utils/start_hybrid.sh"
echo "   • Ollama only: systemctl --user start ollama"
echo "==========================================="
echo ""
