#!/bin/bash

# Hybrid monitoring script for NLT Chatbot
# Monitors both native Ollama and containerized services

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${2}${1}${NC}"
}

# Function to get timestamp
get_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Function to check service health
check_service_health() {
    local service_name="$1"
    local url="$2"
    local expected_status="$3"
    
    local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [[ "$status" == "$expected_status" ]]; then
        echo -e "${GREEN}✅ $service_name${NC}"
        return 0
    else
        echo -e "${RED}❌ $service_name (HTTP $status)${NC}"
        return 1
    fi
}

# Function to get system metrics
get_system_metrics() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    local mem_usage=$(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100.0}')
    local disk_usage=$(df -h / | awk 'NR==2{printf "%s", $5}')
    
    echo -e "${CYAN}💻 System: CPU ${cpu_usage}% | RAM ${mem_usage} | Disk ${disk_usage}${NC}"
}

# Function to check native Ollama
check_native_ollama() {
    print_status "🤖 Native Ollama Status:" $BLUE
    
    # Check if process is running
    if pgrep -x "ollama" > /dev/null; then
        echo -e "   ${GREEN}✅ Process running (PID: $(pgrep -x ollama))${NC}"
    else
        echo -e "   ${RED}❌ Process not running${NC}"
        return 1
    fi
    
    # Check systemd status
    if systemctl --user is-active ollama > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Systemd service active${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Systemd service not active (manual start?)${NC}"
    fi
    
    # Check API response
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ API responding${NC}"
        
        # Get model info
        models=$(curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null | wc -l)
        echo -e "   ${CYAN}📚 Models loaded: $models${NC}"
        
        # Check GPU status if available
        if command -v rocm-smi > /dev/null 2>&1; then
            gpu_temp=$(rocm-smi --showtemp | grep -o '[0-9]\+\.[0-9]\+c' | head -1)
            gpu_usage=$(rocm-smi --showuse | grep -o '[0-9]\+%' | head -1)
            if [[ -n "$gpu_temp" ]] && [[ -n "$gpu_usage" ]]; then
                echo -e "   ${MAGENTA}🎮 GPU: ${gpu_usage} usage, ${gpu_temp}°C${NC}"
            fi
        fi
    else
        echo -e "   ${RED}❌ API not responding${NC}"
        return 1
    fi
    
    return 0
}

# Function to check containerized services
check_containers() {
    print_status "🐳 Container Status:" $BLUE
    
    if [[ ! -f "docker-compose.hybrid.yml" ]]; then
        echo -e "   ${RED}❌ docker-compose.hybrid.yml not found${NC}"
        return 1
    fi
    
    # Get container status
    local running_containers=$(sudo docker compose -f docker-compose.hybrid.yml ps --services --filter "status=running" | wc -l)
    local total_containers=$(sudo docker compose -f docker-compose.hybrid.yml ps --services | wc -l)
    
    echo -e "   ${CYAN}📦 Running: $running_containers/$total_containers containers${NC}"
    
    # Check individual services
    local services=(
        "chatbot|http://localhost:5000/api/health|200"
    )
    
    local all_healthy=true
    for service_info in "${services[@]}"; do
        IFS='|' read -r name url status <<< "$service_info"
        echo -n "   "
        if ! check_service_health "$name" "$url" "$status"; then
            all_healthy=false
        fi
    done
    
    if $all_healthy; then
        return 0
    else
        return 1
    fi
}

# Function to check hybrid connectivity
check_hybrid_connectivity() {
    print_status "🔗 Hybrid Connectivity:" $BLUE
    
    # Test connection from container to native Ollama
    local response=$(sudo docker compose -f docker-compose.hybrid.yml exec -T chatbot curl -s http://172.17.0.1:11434/api/tags 2>/dev/null)
    if [[ $? -eq 0 ]] && echo "$response" | jq -e '.models' > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Container → Native Ollama${NC}"
    else
        echo -e "   ${RED}❌ Container → Native Ollama${NC}"
        return 1
    fi
    
    # Test end-to-end chat functionality
    local chat_response=$(curl -s -X POST http://localhost:5000/api/chat \
        -H "Content-Type: application/json" \
        -d '{"message": "health check", "conversation_id": "monitor-test"}' 2>/dev/null)
    
    if [[ $? -eq 0 ]] && echo "$chat_response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ End-to-end chat${NC}"
        local response_time=$(echo "$chat_response" | jq -r '.response_time_ms' 2>/dev/null)
        if [[ "$response_time" != "null" ]] && [[ -n "$response_time" ]]; then
            echo -e "   ${CYAN}⚡ Response time: ${response_time}ms${NC}"
        fi
    else
        echo -e "   ${RED}❌ End-to-end chat${NC}"
        return 1
    fi
    
    return 0
}

# Function to show resource usage
show_resource_usage() {
    print_status "📊 Resource Usage:" $BLUE
    
    # Docker stats
    echo -e "   ${CYAN}🐳 Container Resources:${NC}"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | grep -E "(NAME|nlt_chatbot)" | sed 's/^/      /'
    
    # Native Ollama memory usage
    local ollama_pid=$(pgrep -x "ollama")
    if [[ -n "$ollama_pid" ]]; then
        local ollama_mem=$(ps -p "$ollama_pid" -o rss= 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
        echo -e "   ${CYAN}🤖 Native Ollama: ${ollama_mem}${NC}"
    fi
}

# Function to monitor continuously
continuous_monitor() {
    print_status "🔄 Starting continuous monitoring (Ctrl+C to stop)..." $YELLOW
    echo ""
    
    while true; do
        clear
        echo "======================================"
        print_status "NLT Chatbot Hybrid Monitor" $BLUE
        print_status "$(get_timestamp)" $CYAN
        echo "======================================"
        echo ""
        
        get_system_metrics
        echo ""
        
        local ollama_ok=true
        local containers_ok=true
        local hybrid_ok=true
        
        if ! check_native_ollama; then
            ollama_ok=false
        fi
        echo ""
        
        if ! check_containers; then
            containers_ok=false
        fi
        echo ""
        
        if ! check_hybrid_connectivity; then
            hybrid_ok=false
        fi
        echo ""
        
        show_resource_usage
        echo ""
        
        # Overall status
        if $ollama_ok && $containers_ok && $hybrid_ok; then
            print_status "🎉 Overall Status: HEALTHY" $GREEN
        else
            print_status "⚠️  Overall Status: ISSUES DETECTED" $YELLOW
        fi
        
        echo ""
        print_status "Next check in 10 seconds..." $CYAN
        sleep 10
    done
}

# Main script logic
case "${1:-once}" in
    "continuous"|"watch"|"-w")
        continuous_monitor
        ;;
    "once"|"check"|"-c"|"")
        print_status "NLT Chatbot Hybrid Monitor - $(get_timestamp)" $BLUE
        echo "======================================"
        echo ""
        
        get_system_metrics
        echo ""
        
        check_native_ollama
        echo ""
        
        check_containers
        echo ""
        
        check_hybrid_connectivity
        echo ""
        
        show_resource_usage
        echo ""
        ;;
    "help"|"-h"|"--help")
        print_status "NLT Chatbot Hybrid Monitor" $BLUE
        echo ""
        echo "Usage: $0 [option]"
        echo ""
        echo "Options:"
        echo "  once, check, -c     Run a single health check (default)"
        echo "  continuous, watch, -w   Run continuous monitoring"
        echo "  help, -h, --help    Show this help message"
        echo ""
        ;;
    *)
        print_status "Unknown option: $1" $RED
        print_status "Use '$0 help' for usage information" $YELLOW
        exit 1
        ;;
esac
