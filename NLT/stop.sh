#!/bin/bash

# NLT Chatbot Stop Script
# Intelligently detects current configuration and shuts down appropriately

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/.current_hardware_config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}NLT Chatbot Stop Script${NC}"
echo "=================================="

# Check if configuration file exists
if [ ! -f "${CONFIG_FILE}" ]; then
    echo -e "${YELLOW}Warning: No configuration file found (${CONFIG_FILE})${NC}"
    echo "This suggests no deployment is currently active."
    
    # Check for any running containers anyway
    if docker ps --format "table {{.Names}}" | grep -q "nlt_chatbot\|ollama\|qdrant\|postgres"; then
        echo -e "${YELLOW}However, found some containers that might be related...${NC}"
        echo "Attempting to stop any running containers:"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "nlt_chatbot|ollama|qdrant|postgres" || true
        
        echo -e "\n${BLUE}Choose how to proceed:${NC}"
        echo "1) Stop all Docker containers"
        echo "2) Stop only NLT-related containers" 
        echo "3) Exit without stopping anything"
        read -p "Enter your choice (1-3): " choice
        
        case $choice in
            1)
                echo -e "${YELLOW}Stopping all Docker containers...${NC}"
                docker stop $(docker ps -q) 2>/dev/null || echo "No containers to stop"
                ;;
            2)
                echo -e "${YELLOW}Stopping NLT-related containers...${NC}"
                docker ps -q --filter "name=nlt_chatbot" | xargs docker stop 2>/dev/null || true
                docker ps -q --filter "name=ollama" | xargs docker stop 2>/dev/null || true
                docker ps -q --filter "name=qdrant" | xargs docker stop 2>/dev/null || true
                docker ps -q --filter "name=postgres" | xargs docker stop 2>/dev/null || true
                ;;
            3)
                echo -e "${GREEN}Exiting without stopping containers.${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Exiting.${NC}"
                exit 1
                ;;
        esac
    else
        echo -e "${GREEN}No running containers found. Nothing to stop.${NC}"
    fi
    exit 0
fi

# Read current configuration
CURRENT_CONFIG=$(cat "${CONFIG_FILE}")
echo -e "Current configuration: ${GREEN}${CURRENT_CONFIG}${NC}"

case "${CURRENT_CONFIG}" in
    "hybrid")
        echo -e "${BLUE}Stopping hybrid deployment...${NC}"
        if [ -f "${SCRIPT_DIR}/utils/stop_hybrid.sh" ]; then
            echo "Calling utils/stop_hybrid.sh..."
            "${SCRIPT_DIR}/utils/stop_hybrid.sh"
        else
            echo -e "${RED}Error: utils/stop_hybrid.sh not found!${NC}"
            echo "Attempting manual hybrid shutdown..."
            
            # Manual hybrid shutdown
            echo "Stopping Docker containers..."
            docker compose -f docker-compose.hybrid.yml down 2>/dev/null || true
            
            echo "Checking native Ollama service..."
            if systemctl is-active --quiet ollama 2>/dev/null; then
                echo "Native Ollama service is running (managed separately)"
                echo "Use 'sudo systemctl stop ollama' if you want to stop it"
            fi
        fi
        ;;
    
    "cpu"|"CPU")
        echo -e "${BLUE}Stopping CPU-only deployment...${NC}"
        docker compose -f docker-compose.cpu.yml down
        ;;
    
    "nvidia"|"NVIDIA")
        echo -e "${BLUE}Stopping NVIDIA GPU deployment...${NC}"
        docker compose -f docker-compose.nvidia.yml down
        ;;
    
    "amd"|"AMD")
        echo -e "${BLUE}Stopping AMD GPU deployment...${NC}"
        docker compose -f docker-compose.amd.yml down
        ;;
    
    "rocm"|"ROCM")
        echo -e "${BLUE}Stopping ROCm deployment...${NC}"
        if [ -f docker-compose.rocm.yml ] && [ -s docker-compose.rocm.yml ]; then
            docker compose -f docker-compose.rocm.yml down
        else
            echo -e "${YELLOW}ROCm compose file is empty, using AMD configuration...${NC}"
            docker compose -f docker-compose.amd.yml down
        fi
        ;;
    
    "cloud"|"CLOUD")
        echo -e "${BLUE}Stopping cloud deployment...${NC}"
        docker compose -f docker-compose.cloud.yml down
        
        # Clean up any orphaned cloud containers
        echo "Cleaning up cloud-specific containers..."
        docker ps -q --filter "name=nlt_chatbot_cloud" | xargs docker stop 2>/dev/null || true
        docker ps -q --filter "name=nlt_ollama_keepalive_cloud" | xargs docker stop 2>/dev/null || true
        
        # Warning about cloud resources
        echo ""
        echo -e "${RED}⚠️  WARNING: CLOUD RESOURCES NOT TERMINATED ⚠️${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}This script only stopped local Docker containers.${NC}"
        echo -e "${RED}Your remote cloud resources (RunPod, etc.) are still running${NC}"
        echo -e "${RED}and may continue to incur charges!${NC}"
        echo ""
        echo -e "${YELLOW}To stop cloud resources and prevent additional costs:${NC}"
        echo -e "${YELLOW}• Log into your cloud provider dashboard${NC}"
        echo -e "${YELLOW}• Terminate/stop your remote instances manually${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        ;;
    
    "custom"|"CUSTOM")
        echo -e "${BLUE}Stopping custom Ollama URL deployment...${NC}"
        docker compose -f docker-compose.custom.yml down
        
        # Clean up any orphaned custom containers
        echo "Cleaning up custom-specific containers..."
        docker ps -q --filter "name=nlt_chatbot_custom" | xargs docker stop 2>/dev/null || true
        
        # Note about remote resources
        if [ -f .custom_ollama_url ]; then
            custom_url=$(cat .custom_ollama_url)
            echo ""
            echo -e "${YELLOW}Note: This script only stopped local Docker containers.${NC}"
            echo -e "${YELLOW}Your Ollama instance at ${custom_url} is still running.${NC}"
            echo -e "${YELLOW}If you want to stop it, you'll need to do so manually.${NC}"
            echo ""
        fi
        ;;
    
    *)
        echo -e "${YELLOW}Unknown configuration: ${CURRENT_CONFIG}${NC}"
        echo "Attempting to stop common configurations..."
        
        # Try to stop any running compose configurations
        for compose_file in docker-compose.yml docker-compose.cpu.yml docker-compose.nvidia.yml docker-compose.amd.yml docker-compose.hybrid.yml docker-compose.cloud.yml docker-compose.custom.yml; do
            if [ -f "${compose_file}" ]; then
                echo "Trying ${compose_file}..."
                docker compose -f "${compose_file}" down 2>/dev/null || true
            fi
        done
        ;;
esac

# Clean up configuration file after successful shutdown
if [ -f "${CONFIG_FILE}" ]; then
    echo -e "\n${BLUE}Cleaning up configuration...${NC}"
    rm "${CONFIG_FILE}"
    echo "Configuration file removed."
fi

# Show final status
echo -e "\n${GREEN}Stop script completed.${NC}"
echo "To verify all containers are stopped, run: docker ps"
