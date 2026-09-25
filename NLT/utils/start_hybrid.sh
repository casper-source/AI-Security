#!/bin/bash

# Enhanced Hybrid Startup with Model Health Checks
# This script includes corruption prevention measures

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting NLT Chatbot - Enhanced Hybrid Mode with Health Checks"
echo "📁 Project directory: $PROJECT_DIR"

# Create hardware config marker
echo "hybrid" > "$PROJECT_DIR/.current_hardware_config"

# Function to check if we're in render group
check_render_group() {
    if groups | grep -q '\brender\b'; then
        echo "✅ User is in render group"
        return 0
    else
        echo "❌ User not in render group"
        return 1
    fi
}

# Function to start Ollama with GPU optimization
start_ollama() {
    echo "🔧 Starting Ollama with GPU optimization..."
    
    if check_render_group; then
        echo "🎮 Starting Ollama with render group permissions for GPU access..."
        sg render -c 'HSA_OVERRIDE_GFX_VERSION=11.0.0 HIP_VISIBLE_DEVICES=0 ollama serve' &
    else
        echo "⚠️  Starting Ollama without render group (CPU mode)"
        ollama serve &
    fi
    
    local ollama_pid=$!
    echo "📝 Ollama PID: $ollama_pid"
    
    # Wait for Ollama to be ready
    echo "⏳ Waiting for Ollama to start..."
    local attempts=0
    local max_attempts=30
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "✅ Ollama is ready!"
            break
        fi
        attempts=$((attempts + 1))
        echo "   Attempt $attempts/$max_attempts..."
        sleep 2
    done
    
    if [ $attempts -eq $max_attempts ]; then
        echo "❌ Ollama failed to start within timeout"
        exit 1
    fi
}

# Function to check model health
check_model_health() {
    echo "🔍 Checking model health..."
    if [ -f "$PROJECT_DIR/utils/model_health_checker.sh" ]; then
        if "$PROJECT_DIR/utils/model_health_checker.sh" llama3.2:3b; then
            echo "✅ Model health check passed"
        else
            echo "🔧 Model health check failed, but continuing startup..."
        fi
    else
        echo "⚠️  Model health checker not found, skipping..."
    fi
}

# Function to start Docker services
start_docker_services() {
    echo "🐳 Starting Docker services..."
    cd "$PROJECT_DIR"
    
    if ! docker compose -f docker-compose.hybrid.yml up -d --build; then
        echo "❌ Failed to start Docker services"
        exit 1
    fi
    
    echo "✅ Docker services started"
}

# Main execution
main() {
    cd "$PROJECT_DIR"
    
    # Stop any existing services
    echo "🛑 Stopping existing services..."
    "$PROJECT_DIR/utils/stop_hybrid.sh" > /dev/null 2>&1 || true
    
    # Start Ollama
    start_ollama
    
    # Check model health
    check_model_health
    
    # Start Docker services
    start_docker_services
    
    # Final health check
    echo "🏥 Running final system health check..."
    sleep 5
    
    if curl -s http://localhost:5000/ > /dev/null; then
        echo "✅ Flask app is responding"
    else
        echo "⚠️  Flask app may not be ready yet"
    fi
    
    if curl -s http://localhost:11434/api/tags > /dev/null; then
        echo "✅ Ollama is responding"
    else
        echo "❌ Ollama is not responding"
    fi
    
    echo ""
    echo "🎉 NLT Chatbot Hybrid Mode Started Successfully!"
    echo "🌐 Web interface: http://localhost:5000"
    echo "🤖 Ollama API: http://localhost:11434"
    echo "📊 Use 'docker logs nlt_chatbot_hybrid' to monitor Flask app"
    echo "📈 Use './utils/model_health_checker.sh' to check model health anytime"
    echo ""
    echo "🔧 If you experience model corruption, run: './utils/model_health_checker.sh llama3.2:3b'"
}

main "$@"
