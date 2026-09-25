#!/bin/bash

# Quick Setup Script for Ollama Chatbot
# Downloads popular models and starts the appropriate configuration

set -e

echo "Ollama Chatbot Quick Setup"
echo "=============================="
echo ""

# Check if configuration exists
if [ ! -f .current_hardware_config ]; then
    echo "No hardware configuration found!"
    echo "Please run ./launch.sh first to select your hardware configuration."
    exit 1
fi

HARDWARE_CONFIG=$(cat .current_hardware_config)
echo "Current configuration: ${HARDWARE_CONFIG^^}"

# Handle hybrid configuration
if [ "$HARDWARE_CONFIG" = "hybrid" ]; then
    echo "Hybrid configuration detected!"
    echo "For hybrid mode, models are managed through native Ollama."
    echo "Use 'ollama pull <model>' to install additional models."
    echo ""
    echo "Currently available models:"
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null || echo "   Unable to list models"
    else
        echo "   Native Ollama is not running. Please start it first with ./utils/start_hybrid.sh"
    fi
    exit 0
fi

# Check if services are running
if ! docker compose ps --format json | jq -r '.[].Health' | grep -q "healthy" 2>/dev/null; then
    echo "Services are not running. Starting them now..."
    docker compose up -d
    
    echo "Waiting for services to be ready..."
    sleep 10
fi

echo ""
echo "Installing recommended models for your hardware..."

case $HARDWARE_CONFIG in
    "cpu")
        echo "Installing CPU-optimized models..."
        docker exec ollama_service ollama pull phi3:mini
        docker exec ollama_service ollama pull mistral:7b
        ;;
    "nvidia"|"amd")
        echo "Installing GPU-optimized models..."
        docker exec ollama_service ollama pull mistral:7b
        docker exec ollama_service ollama pull llama2:13b
        docker exec ollama_service ollama pull codellama:7b
        ;;
esac

echo ""
echo "Setup complete!"
echo "Open your browser to: http://localhost:5000"
echo ""
echo "Available models:"
docker exec ollama_service ollama list
