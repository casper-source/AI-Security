#!/bin/bash

# Ollama Chatbot Hardware-Optimized Launcher
# Automatically detects hardware and launches appropriate configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${NC}"

echo -e "${BLUE}Welcome to the Hardware-Optimized Launcher!${NC}"
echo ""

# Function to detect hardware
detect_hardware() {
    echo -e "${YELLOW}Detecting your hardware...${NC}"
    
    # Check for NVIDIA GPU
    if command -v nvidia-smi &> /dev/null; then
        if nvidia-smi &> /dev/null; then
            echo -e "${GREEN}NVIDIA GPU detected!${NC}"
            nvidia-smi --query-gpu=name --format=csv,noheader | head -1 | sed 's/^/   GPU: /'
            DETECTED_HARDWARE="nvidia"
            return
        fi
    fi
    
    # Check for AMD GPU/APU with device files
    if [ -e /dev/kfd ] && [ -d /dev/dri ]; then
        echo -e "${GREEN}AMD GPU/APU devices detected!${NC}"
        if command -v rocm-smi &> /dev/null && rocm-smi &> /dev/null; then
            echo -e "   ROCm utilities available"
            DETECTED_HARDWARE="amd"
            return
        else
            echo -e "${YELLOW}   ROCm not installed - you can try AMD GPU mode or use CPU mode${NC}"
            DETECTED_HARDWARE="amd"  # Still offer AMD option
            return
        fi
    fi
    
    # Check for AMD GPU via lspci (fallback)
    if lspci | grep -i "amd\|ati\|radeon" | grep -i "vga\|3d\|display" &> /dev/null; then
        echo -e "${YELLOW}AMD GPU detected via lspci, but no device files found${NC}"
        echo -e "   Consider installing ROCm for GPU acceleration"
        DETECTED_HARDWARE="cpu"
        return
    fi
    
    # Check CPU info
    if [ -f /proc/cpuinfo ]; then
        CPU_INFO=$(grep "model name" /proc/cpuinfo | head -1 | cut -d: -f2 | sed 's/^ *//')
        echo -e "${BLUE}CPU detected: ${CPU_INFO}${NC}"
    fi
    
    DETECTED_HARDWARE="cpu"
}

# Function to show hardware options
show_hardware_menu() {
    echo ""
    echo -e "${PURPLE}Available Hardware Configurations:${NC}"
    echo ""
    echo -e "${GREEN}1) CPU Only${NC}          - Works on any system, no GPU required"
    echo -e "${GREEN}2) NVIDIA GPU${NC}        - CUDA acceleration (requires NVIDIA Docker runtime)"
    echo -e "${GREEN}3) AMD GPU (ROCm)${NC}    - ROCm acceleration (experimental, requires ROCm)"
    echo -e "${GREEN}4) Hybrid${NC}            - Native Ollama + containerized services (best performance)"
    echo -e "${GREEN}5) Cloud${NC}             - Cloud hybrid (remote Ollama via Tailscale or HTTPS)"
    echo -e "${GREEN}6) Custom Ollama URL${NC} - Connect to Ollama at a custom URL"
    echo -e "${GREEN}7) Auto-detect${NC}       - Let the script choose based on your hardware"
    echo -e "${GREEN}8) Show Current Config${NC} - Display current configuration"
    echo -e "${GREEN}9) Exit${NC}"
    echo ""
}

# Function to copy configuration
setup_configuration() {
    local config=$1
    local config_file=""
    
    case $config in
        "cpu")
            config_file="docker-compose.cpu.yml"
            echo -e "${BLUE}Setting up CPU-optimized configuration...${NC}"
            ;;
        "nvidia")
            config_file="docker-compose.nvidia.yml"
            echo -e "${GREEN}Setting up NVIDIA GPU configuration...${NC}"
            ;;
        "amd")
            config_file="docker-compose.amd.yml"
            echo -e "${RED}Setting up AMD GPU configuration...${NC}"
            ;;
        "hybrid")
            config_file="docker-compose.hybrid.yml"
            echo -e "${CYAN}Setting up hybrid configuration...${NC}"
            ;;
        "cloud")
            config_file="docker-compose.cloud.yml"
            echo -e "${CYAN}Setting up cloud hybrid configuration...${NC}"
            echo ""
            echo -e "${PURPLE}Cloud Connection Type:${NC}"
            echo -e "${GREEN}1) Tailscale${NC} - Connect via Tailscale network"
            echo -e "${GREEN}2) Direct HTTPS${NC} - Connect via direct HTTPS URL"
            echo ""
            read -p "$(echo -e ${BLUE}Select connection type [1-2]:${NC} )" cloud_choice
            
            cloud_mode=""
            case $cloud_choice in
                1)
                    cloud_mode="tailscale"
                    echo -e "${CYAN}Setting up Tailscale connection...${NC}"
                    echo -e "${YELLOW}Please ensure you have edited 'docker-compose.cloud.yml' to replace placeholders (REPLACE_WITH_TAILSCALE_HOST) before continuing.${NC}"
                    read -p "Press Enter to continue if you've edited the file or Ctrl-C to abort..."
                    ;;
                2)
                    cloud_mode="https"
                    echo -e "${CYAN}Setting up direct HTTPS connection...${NC}"
                    echo "Please enter your proxied Ollama URL (e.g., https://your-domain.com):"
                    read -p "URL: " https_url
                    
                    if [ -n "$https_url" ]; then
                        # Remove trailing slash if present
                        https_url=$(echo "$https_url" | sed 's/\/$//')
                        echo "$https_url" > .custom_ollama_url
                        echo -e "${GREEN}✓ Custom Ollama URL saved: $https_url${NC}"
                        echo ""
                        echo -e "${YELLOW}Make sure your Ollama instance is accessible at: $https_url${NC}"
                        echo -e "${YELLOW}The chatbot will connect to: $https_url/api${NC}"
                        
                        # Update docker-compose.cloud.yml with the custom URL
                        cp "$config_file" "${config_file}.backup"
                        sed "s|OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=${https_url}|g" "${config_file}.backup" > "$config_file"
                        echo -e "${GREEN}✓ Updated docker-compose.cloud.yml with custom URL${NC}"
                    else
                        echo -e "${RED}❌ No URL provided. Falling back to Tailscale mode.${NC}"
                        cloud_mode="tailscale"
                        echo -e "${YELLOW}Please ensure you have edited 'docker-compose.cloud.yml' to replace placeholders (REPLACE_WITH_TAILSCALE_HOST) before continuing.${NC}"
                        read -p "Press Enter to continue if you've edited the file or Ctrl-C to abort..."
                    fi
                    ;;
                *)
                    echo -e "${RED}Invalid choice. Falling back to Tailscale mode.${NC}"
                    cloud_mode="tailscale"
                    echo -e "${YELLOW}Please ensure you have edited 'docker-compose.cloud.yml' to replace placeholders (REPLACE_WITH_TAILSCALE_HOST) before continuing.${NC}"
                    read -p "Press Enter to continue if you've edited the file or Ctrl-C to abort..."
                    ;;
            esac
            ;;
        "custom")
            config_file="docker-compose.custom.yml"
            echo -e "${CYAN}Setting up custom Ollama URL configuration...${NC}"
            ;;
        *)
            echo -e "${RED}Invalid configuration: $config${NC}"
            return 1
            ;;
    esac
    
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}Configuration file $config_file not found!${NC}"
        return 1
    fi
    
    cp "$config_file" docker-compose.yml
    echo -e "${GREEN}Configuration updated to use $config_file${NC}"
    
    # Store the current configuration
    echo "$config" > .current_hardware_config
}

# Function to show current configuration
show_current_config() {
    if [ -f .current_hardware_config ]; then
        local current=$(cat .current_hardware_config)
        echo -e "${CYAN}Current hardware configuration: ${current^^}${NC}"
        
        # Show selected model
        if [ -f .selected_model ]; then
            local selected_model=$(cat .selected_model)
            echo -e "${CYAN}Selected model: ${selected_model}${NC}"
        else
            echo -e "${YELLOW}No model has been selected yet${NC}"
        fi
        
        # Show custom Ollama URL if in custom mode
        if [ "$current" = "custom" ] && [ -f .custom_ollama_url ]; then
            local custom_url=$(cat .custom_ollama_url)
            echo -e "${CYAN}Custom Ollama URL: ${custom_url}${NC}"
        fi
        
        # Show running containers/services
        if [ "$current" = "hybrid" ]; then
            echo -e "${GREEN}Hybrid mode status:${NC}"
            
            # Check native Ollama
            if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
                echo -e "   Native Ollama: ${GREEN}Running${NC}"
                echo -e "${GREEN}Available models:${NC}"
                curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null | sed 's/^/   /' || echo "   No models loaded"
            else
                echo -e "   Native Ollama: ${RED}Not running${NC}"
            fi
            
            # Check containers
            if docker compose ps --format table 2>/dev/null | grep -q "healthy\|running"; then
                echo -e "${GREEN}Container services:${NC}"
                docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
            else
                echo -e "   Container services: ${YELLOW}Not running${NC}"
            fi
        elif docker compose ps --format table | grep -q "ollama"; then
            echo -e "${GREEN}Current service status:${NC}"
            docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
            
            # Show loaded models if services are running
            echo ""
            echo -e "${GREEN}Currently loaded models:${NC}"
            docker exec -i ollama_service ollama list 2>/dev/null | tail -n +2 || echo "   No models loaded"
        else
            echo -e "${YELLOW}Services are not currently running${NC}"
        fi
    else
        echo -e "${YELLOW}No configuration has been set yet${NC}"
    fi
}

# Function to validate prerequisites
check_prerequisites() {
    local config=$1
    
    case $config in
        "nvidia")
            if ! command -v nvidia-smi &> /dev/null; then
                echo -e "${RED}NVIDIA drivers not found!${NC}"
                echo -e "   Please install NVIDIA drivers and nvidia-docker runtime"
                return 1
            fi
            
            if ! docker run --rm --gpus all nvidia/cuda:11.0-base-ubuntu18.04 nvidia-smi &> /dev/null; then
                echo -e "${RED}NVIDIA Docker runtime not working!${NC}"
                echo -e "   Please install nvidia-container-toolkit"
                return 1
            fi
            
            echo -e "${GREEN}NVIDIA prerequisites validated${NC}"
            ;;
        "amd")
            echo -e "${BLUE}Checking AMD GPU setup...${NC}"
            
            # Check for device files
            if [ ! -e /dev/kfd ] || [ ! -d /dev/dri ]; then
                echo -e "${RED}AMD GPU device files not found!${NC}"
                echo -e "   Missing /dev/kfd or /dev/dri - GPU acceleration won't work"
                echo -e "${YELLOW}Suggestion: Use CPU mode instead for better compatibility${NC}"
                read -p "$(echo -e ${BLUE}Continue with AMD setup anyway? [y/N]:${NC} )" continue_amd
                if [[ ! "$continue_amd" =~ ^[Yy]$ ]]; then
                    echo -e "${BLUE}Switching to CPU configuration...${NC}"
                    setup_configuration "cpu" && launch_services "cpu"
                    return $?
                fi
            fi
            
            # Check ROCm
            if ! command -v rocm-smi &> /dev/null; then
                echo -e "${YELLOW}ROCm not detected - performance may be limited${NC}"
                echo -e "   You can still try AMD mode, but CPU mode might be more stable"
            else
                echo -e "${GREEN}AMD ROCm detected${NC}"
            fi
            
            echo -e "${GREEN}Proceeding with AMD configuration${NC}"
            ;;
        "cpu")
            echo -e "${GREEN}CPU configuration - no additional prerequisites needed${NC}"
            ;;
    esac
}

# Function to get available models from Ollama
get_available_models() {
    echo "Checking available models..."
    local models=""
    
    # Try to get models from running ollama instance
    if docker compose ps --format json | jq -r '.State' | grep -q "running"; then
        ollama_container=$(get_ollama_container || true)
        if [ -n "$ollama_container" ]; then
            models=$(docker exec -i "$ollama_container" ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | grep -v "^$" || echo "")
        else
            models=""
        fi
    fi
    
    # If no models found or ollama not running, provide Mistral models list (Apache 2.0 licensed)
    if [ -z "$models" ]; then
    models="granite3.1-moe:3b
mistral:7b
mixtral:8x7b
mistral-large:latest"
    fi
    
    echo "$models"
}

# Return the running Ollama container name, if any
get_ollama_container() {
    # Prefer an exact service container name if present
    if docker ps --format '{{.Names}}' | grep -xq 'ollama_service'; then
        docker ps --format '{{.Names}}' | grep -x 'ollama_service' | head -n1
        return 0
    fi

    # Any container with 'ollama' in the name
    local name
    name=$(docker ps --format '{{.Names}}' | grep -m1 'ollama' || true)
    if [ -n "$name" ]; then
        echo "$name"
        return 0
    fi

    # Fall back to docker compose listing (container name may include project prefix)
    if command -v docker-compose &>/dev/null; then
        name=$(docker ps --format '{{.Names}}' | grep -m1 'nlt_ollama' || true)
        if [ -n "$name" ]; then
            echo "$name"
            return 0
        fi
    fi

    # Cloud-specific container name
    if docker ps --format '{{.Names}}' | grep -q 'nlt_ollama_cloud'; then
        docker ps --format '{{.Names}}' | grep -x 'nlt_ollama_cloud' | head -n1
        return 0
    fi

    return 1
}

# Return the running chatbot container name, if any
get_chatbot_container() {
    # Look for a container with 'nlt_chatbot' or 'chatbot' in the name
    local name
    name=$(docker ps --format '{{.Names}}' | grep -m1 'nlt_chatbot\|chatbot' || true)
    if [ -n "$name" ]; then
        echo "$name"
        return 0
    fi

    # Cloud-specific container name
    name=$(docker ps --format '{{.Names}}' | grep -m1 'nlt_chatbot_cloud\|nlt_chatbot' || true)
    if [ -n "$name" ]; then
        echo "$name"
        return 0
    fi
    return 1
}

# Verify model is present in Ollama after pull; supports native and containerized Ollama
verify_model_available() {
    local model_name="$1"
    # Check native Ollama first
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        if curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null | grep -xq "$model_name"; then
            return 0
        fi
    fi

    # Check containerized Ollama
    if docker compose ps --format json 2>/dev/null | jq -r '.State' | grep -q "running"; then
        ollama_container=$(get_ollama_container || true)
        if [ -n "$ollama_container" ]; then
            if docker exec -i "$ollama_container" ollama list 2>/dev/null | awk '{print $1}' | grep -xq "$model_name"; then
                return 0
            fi
        fi
    fi

    return 1
}

# Function to get model recommendations based on hardware
get_model_recommendations() {
    local config=$1
    local available_models="$2"
    
    case $config in
        "cpu")
            echo "For CPU-only systems, lightweight models are recommended for best performance:"
            echo "  granite3.1-moe:3b             - IBM Granite MoE 3B Code/ MoE model"
            echo "  mistral:7b                     - Base Mistral 7B (Apache 2.0), quantized for CPU"
            echo ""
            echo "WARNING: Mixtral models (8x7b, 8x22b) will be extremely slow on CPU"
            echo "         Consider using GPU acceleration for larger models"
            ;;
        "nvidia")
            local vram=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
            if [ "$vram" -gt 73000 ]; then
                echo "Your NVIDIA GPU has sufficient VRAM for all Mistral models:"
                echo "  mistral:7b                     - Base Mistral 7B (fast, efficient)"
                echo "  mixtral:8x7b                   - Mixtral 8x7B MoE (recommended)"
                echo "  mistral-large:latest           - Mistral Large 123B (highest quality)"
                echo ""
                echo "All models use Apache 2.0 licensing (commercial-friendly)"
            elif [ "$vram" -gt 26000 ]; then
                echo "Your NVIDIA GPU can handle medium Mistral models:"
                echo "  mistral:7b     - Base Mistral 7B (recommended)"
                echo "  mixtral:8x7b                   - Mixtral 8x7B MoE (may use most VRAM)"
                echo ""
                echo "WARNING: Mistral Large will likely exceed your VRAM"
            else
                echo "Your NVIDIA GPU is suitable for the base Mistral model:"
                echo "  mistral:7b                     - Base Mistral 7B (quantized)"
                echo ""
                echo "WARNING: Mixtral models will likely exceed your VRAM"
                echo "         Consider upgrading GPU for larger Mistral variants"
            fi
            ;;
        "amd")
            echo "For AMD GPU systems (experimental support):"
            echo "  mistral:7b                     - Base Mistral 7B (recommended starting point)"
            echo "  mixtral:8x7b                   - Mixtral 8x7B (if sufficient VRAM)"
            echo ""
            echo "NOTE: AMD GPU support is experimental. Mixtral models may require"
            echo "      significant VRAM. Consider CPU mode if performance is poor."
            ;;
    esac
}

# Function to validate model compatibility
validate_model_compatibility() {
    local model=$1
    local config=$2
    local warnings=()
    
    # Extract model size if possible
    local model_size=""
    if [[ $model =~ :([0-9]+)b ]]; then
        model_size="${BASH_REMATCH[1]}"
    fi
    
    case $config in
        "cpu")
            if [ -n "$model_size" ] && [ "$model_size" -ge 8 ]; then
                warnings+=("Large models (${model_size}b) will be very slow on CPU")
                warnings+=("Consider using a smaller model like granite3.1-moe:3b.")
            fi
            ;;
        "nvidia")
            local vram=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 2>/dev/null || echo "0")
            if [ -n "$model_size" ]; then
                if [ "$model_size" -ge 70 ] && [ "$vram" -lt 40000 ]; then
                    warnings+=("70b+ models typically require 40GB+ VRAM")
                    warnings+=("Your GPU has ${vram}MB VRAM - model may not fit")
                    warnings+=("Consider granite3.1-moe:3b or smaller models instead")
                elif [ "$model_size" -ge 13 ] && [ "$vram" -lt 16000 ]; then
                    warnings+=("13b+ models typically require 16GB+ VRAM")
                    warnings+=("Your GPU has ${vram}MB VRAM - performance may be poor")
                elif [ "$model_size" -ge 8 ] && [ "$vram" -lt 8000 ]; then
                    warnings+=("8b models typically require 8GB+ VRAM")
                    warnings+=("Your GPU has ${vram}MB VRAM - consider smaller models")
                fi
            fi
            ;;
        "amd")
            if [ -n "$model_size" ] && [ "$model_size" -ge 8 ]; then
                warnings+=("AMD GPU support is experimental - large models may not work well")
                warnings+=("Consider CPU mode for better compatibility with large models")
            fi
            ;;
    esac
    
    if [ ${#warnings[@]} -gt 0 ]; then
        echo -e "${YELLOW}Compatibility warnings for ${model}:${NC}"
        for warning in "${warnings[@]}"; do
            echo -e "${YELLOW}  - ${warning}${NC}"
        done
        return 1
    fi
    
    return 0
}

# Function to prompt for model selection
select_model() {
    local config=$1
    
    echo ""
    echo -e "${PURPLE}Model Selection for ${config^^} Configuration${NC}"
    echo "=================================================================="
    
    # Show hardware-specific recommendations
    case $config in
        "cpu")
            echo -e "${YELLOW}CPU-only configuration: Smaller models recommended for better performance${NC}"
            ;;
        "nvidia"|"amd")
            echo -e "${GREEN}GPU configuration: Larger models available with hardware acceleration${NC}"
            ;;
        "hybrid")
            echo -e "${CYAN}Hybrid configuration: All model sizes supported with optimal performance${NC}"
            ;;
        "cloud")
            echo -e "${CYAN}Cloud configuration: Model selection depends on your remote Ollama server capabilities${NC}"
            ;;
        "custom")
            echo -e "${CYAN}Custom configuration: Model selection depends on your remote Ollama server capabilities${NC}"
            ;;
    esac
    
    echo ""
    echo -e "${CYAN}Available Models:${NC}"
    echo -e "${GREEN}1)${NC} granite3.1-moe:3b              - IBM Granite MoE 3B (code/model optimized)"
    echo -e "${GREEN}2)${NC} mistral:7b                     - Base Mistral 7B (efficient, good quality)"
    echo -e "${GREEN}3)${NC} mixtral:8x7b                   - Mixtral 8x7B MoE (requires ~26GB VRAM)"  
    echo -e "${GREEN}4)${NC} mistral-large:latest           - Mistral Large 123B (requires ~73GB VRAM)"
    echo -e "${GREEN}5)${NC} Custom model                   - Enter your own model name"
    echo -e "${GREEN}6)${NC} Skip selection                 - Use current model or default"
    
    echo ""
    read -p "$(echo -e ${BLUE}Select a model [1-6]:${NC} )" model_choice
    
    local selected_model=""
    
    case $model_choice in
        1)
            selected_model="granite3.1-moe:3b"
            echo -e "${GREEN}Selected: granite3.1-moe:3b (IBM Granite MoE 3B)${NC}"
            ;;
        2)
            selected_model="mistral:7b"
            echo -e "${GREEN}Selected: mistral:7b (Base Mistral 7B)${NC}"
            ;;
        3)
            selected_model="mixtral:8x7b"
            echo -e "${GREEN}Selected: mixtral:8x7b (Mixtral 8x7B MoE)${NC}"
            ;;
        4)
            selected_model="mistral-large:latest"
            echo -e "${GREEN}Selected: mistral-large:latest (Mistral Large)${NC}"
            ;;
        5)
            echo ""
            read -p "$(echo -e ${BLUE}Enter custom model name:${NC} )" selected_model
            if [ -z "$selected_model" ]; then
                echo -e "${RED}No model name provided${NC}"
                return 1
            fi
            echo -e "${GREEN}Selected: ${selected_model} (custom model)${NC}"
            ;;
        6)
            echo "Skipping model selection - using current/default model"
            return 0
            ;;
        *)
            echo -e "${RED}Invalid selection. Please choose 1-6.${NC}"
            return 1
            ;;
    esac
    
    if [ -n "$selected_model" ]; then
        echo ""
        echo -e "${BLUE}Validating model compatibility...${NC}"
        
        # Basic compatibility warnings
        local warnings=()
        case $config in
            "cpu")
                if [[ "$selected_model" == *"13b"* ]]; then
                    warnings+=("13B models are large and may be slow on CPU-only systems")
                    warnings+=("Consider using 3B model for better CPU performance")
                fi
                ;;
            "nvidia"|"amd")
                if [[ "$selected_model" == *"13b"* ]]; then
                    warnings+=("13B models require significant VRAM (16GB+ recommended)")
                fi
                ;;
        esac
        
        if [ ${#warnings[@]} -gt 0 ]; then
            echo -e "${YELLOW}Compatibility warnings for ${selected_model}:${NC}"
            for warning in "${warnings[@]}"; do
                echo -e "${YELLOW}  - ${warning}${NC}"
            done
            echo ""
            read -p "$(echo -e ${YELLOW}Continue with this model anyway? [y/N]:${NC} )" continue_choice
            if [[ ! "$continue_choice" =~ ^[Yy]$ ]]; then
                echo "Please select a different model."
                return 1
            fi
        fi
        
        echo ""
        echo -e "${GREEN}Selected model: ${selected_model}${NC}"
        
        # Store the selected model
        echo "$selected_model" > .selected_model
        echo -e "${GREEN}Model configuration saved: ${selected_model}${NC}"
        # If chatbot container is running, copy selection into it so runtime picks it up
        chatbot_container=$(get_chatbot_container || true)
        if [ -n "$chatbot_container" ]; then
            echo "Copying .selected_model into running chatbot container: $chatbot_container"
            docker cp .selected_model "$chatbot_container":/app/.selected_model || echo "Warning: failed to copy .selected_model into $chatbot_container"
        fi
        
        # Download model based on configuration type
        echo ""
        echo -e "${BLUE}Ensuring model is available...${NC}"
        
        if [ "$config" = "hybrid" ]; then
            # For hybrid mode, use native Ollama
            if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
                echo "Pulling model via native Ollama (this may take a while for large models)..."
                # If the selected model is granite3.1-moe:3b, attempt explicit pull; otherwise fall back to pulling whatever was selected
                if [ "$selected_model" = "granite3.1-moe:3b" ]; then
                    if ollama pull "granite3.1-moe:3b"; then
                        echo -e "${GREEN}Model granite3.1-moe:3b pull completed.${NC}"
                    else
                        echo -e "${YELLOW}Warning: Could not pull granite3.1-moe:3b. It may not be available.${NC}"
                    fi
                else
                    if ollama pull "$selected_model"; then
                        echo -e "${GREEN}Model ${selected_model} pull completed.${NC}"
                    else
                        echo -e "${YELLOW}Warning: Could not pull model. It may not be available.${NC}"
                    fi
                fi

                # Verify model presence after pull
                if verify_model_available "$selected_model"; then
                    echo -e "${GREEN}Verified: ${selected_model} is available in Ollama.${NC}"
                else
                    echo -e "${RED}Verification failed: ${selected_model} not found in Ollama after pull.${NC}"
                    echo "Choose: [r]etry pull, [s]elect another model, [c]ontinue anyway with current selection"
                    read -p "Selection [r/s/c]: " decision
                    case "$decision" in
                        r|R)
                            echo "Retrying pull..."
                            ollama pull "$selected_model" || true
                            ;;
                        s|S)
                            echo "Please re-run the launcher to select another model."
                            return 0
                            ;;
                        *)
                            echo "Continuing without verified model..."
                            ;;
                    esac
                fi
            else
                echo -e "${YELLOW}Native Ollama not running. Model will be downloaded when hybrid system starts.${NC}"
            fi
        elif [ "$config" = "cloud" ]; then
            # For cloud mode, model pulling happens on the remote server
            echo -e "${YELLOW}Cloud mode: Models must be available on your remote Ollama server.${NC}"
            echo -e "${BLUE}Make sure '${selected_model}' is pulled on your remote Ollama host.${NC}"
            echo -e "${CYAN}To pull on remote server: ssh to your host and run 'ollama pull ${selected_model}'${NC}"
        elif [ "$config" = "custom" ]; then
            # For custom mode, model pulling happens on the remote server
            echo -e "${YELLOW}Custom mode: Models must be available on your custom Ollama server.${NC}"
            echo -e "${BLUE}Make sure '${selected_model}' is pulled on your Ollama instance.${NC}"
            if [ -f .custom_ollama_url ]; then
                local custom_url=$(cat .custom_ollama_url)
                echo -e "${CYAN}To pull on your server: Run 'ollama pull ${selected_model}' on the host at ${custom_url}${NC}"
            fi
        else
            # For containerized modes, use Docker
            if docker compose ps --format json 2>/dev/null | jq -r '.State' | grep -q "running"; then
                echo "Pulling model via containerized Ollama (this may take a while for large models)..."
                # Special-case granite3.1-moe:3b to attempt a direct pull first
                if [ "$selected_model" = "granite3.1-moe:3b" ]; then
                    ollama_container=$(get_ollama_container || true)
                    if [ -n "$ollama_container" ] && docker exec -i "$ollama_container" ollama pull "granite3.1-moe:3b"; then
                        echo -e "${GREEN}Model granite3.1-moe:3b pull completed.${NC}"
                    else
                        echo -e "${YELLOW}Warning: Could not pull granite3.1-moe:3b via containerized Ollama. It may not be available.${NC}"
                    fi
                else
                        ollama_container=$(get_ollama_container || true)
                        if [ -n "$ollama_container" ] && docker exec -i "$ollama_container" ollama pull "$selected_model"; then
                        echo -e "${GREEN}Model ${selected_model} pull completed.${NC}"
                    else
                        echo -e "${YELLOW}Warning: Could not pull model. It may not be available.${NC}"
                    fi
                fi

                # Verify model presence after pull (container path)
                if verify_model_available "$selected_model"; then
                    echo -e "${GREEN}Verified: ${selected_model} is available in Ollama.${NC}"
                else
                    echo -e "${RED}Verification failed: ${selected_model} not found in Ollama after pull.${NC}"
                    echo "Choose: [r]etry pull, [s]elect another model, [c]ontinue anyway with current selection"
                    read -p "Selection [r/s/c]: " decision
                    case "$decision" in
                        r|R)
                            echo "Retrying container pull..."
                            ollama_container=$(get_ollama_container || true)
                            if [ -n "$ollama_container" ]; then
                                docker exec -i "$ollama_container" ollama pull "$selected_model" || true
                            else
                                echo -e "${YELLOW}No containerized Ollama detected to retry pull.${NC}"
                            fi
                            ;;
                        s|S)
                            echo "Please re-run the launcher to select another model."
                            return 0
                            ;;
                        *)
                            echo "Continuing without verified model..."
                            ;;
                    esac
                fi
            else
                echo -e "${YELLOW}Containerized services not running. Model will be downloaded when services start.${NC}"
            fi
        fi
        
        return 0
    fi
    
    return 1
}

# Function to recommend models based on hardware
recommend_models() {
    local config=$1
    
    echo -e "${CYAN}Recommended models for your hardware:${NC}"
    echo ""
    
    case $config in
        "cpu")
            echo -e "${GREEN}Fast models (recommended for CPU):${NC}"
            echo "   • granite3.1-moe:3b (2.0GB) - Ultra-fast, great for chat"
            echo "   • mistral:7b (4.4GB) - Excellent balance"
            echo ""
            echo -e "${YELLOW}Commands to pull these models:${NC}"
            echo "   docker exec <ollama-container> ollama pull "
            echo "   docker exec <ollama-container> ollama pull mistral:7b"
            ;;
        "nvidia"|"amd")
            echo -e "${GREEN}GPU-optimized models:${NC}"
            echo "   • mistral:7b (4.4GB) - Fast and efficient"
            echo "   • mixtral:8x7b (26GB) - High quality MoE (if you have enough VRAM)"
            echo "   • mistral-large:latest (73GB) - Top-tier quality (requires high VRAM)"
            echo ""
            echo -e "${YELLOW}Commands to pull these models:${NC}"
            echo "   docker exec <ollama-container> ollama pull mistral:7b"
            echo "   docker exec <ollama-container> ollama pull mixtral:8x7b"
            echo "   docker exec <ollama-container> ollama pull mistral-large:latest"
            ;;
    esac
}

# Function to launch services
launch_services() {
    local config=$1
    
    # Select security level for AI chatbot security teaching
    echo -e "${BLUE}Setting up AI Security Teaching Environment...${NC}"
    select_security_level
    
    echo -e "${BLUE}Launching Ollama Chatbot with $config configuration...${NC}"
    
    # Stop any existing services
    if docker compose ps -q | grep -q .; then
        echo -e "${YELLOW}🛑 Stopping existing services...${NC}"
        docker compose down
    fi
    
    # Export security level for docker-compose
    export AI_SECURITY_LEVEL=${AI_SECURITY_LEVEL:-1}
    echo -e "${CYAN}Using AI Security Level: $AI_SECURITY_LEVEL${NC}"
    
    # Start services
    echo -e "${GREEN}Starting services...${NC}"
    docker compose up -d
    
    # Wait for services to be healthy
    echo -e "${BLUE}Waiting for services to be ready...${NC}"
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker compose ps --format json | jq -r '.Health' | grep -q "healthy"; then
            echo -e "${GREEN}Services are healthy and ready!${NC}"
            break
        fi
        
        echo -ne "${YELLOW}   Attempt $attempt/$max_attempts - waiting for health checks...${NC}\r"
        sleep 2
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo -e "\n${RED}Services failed to become healthy. Check logs with: docker compose logs${NC}"
        return 1
    fi
    
    echo ""
    echo -e "${GREEN}Ollama Chatbot is now running!${NC}"
    echo -e "${CYAN}Web Interface: http://localhost:5000${NC}"
    echo ""
    
    recommend_models "$config"
    
    echo ""
    echo -e "${PURPLE}Useful commands:${NC}"
    echo "   • View logs:        docker compose logs -f"
    echo "   • Stop services:    docker compose down"
    echo "   • Restart:          ./launch.sh"
    echo "   • Pull models:      docker exec <ollama-container> ollama pull <model>"
    echo "   • List models:      docker exec <ollama-container> ollama list"
}

# Function to select security level for AI chatbot security teaching
select_security_level() {
    echo ""
    echo -e "${PURPLE}🔒 AI Chatbot Security Teaching Mode${NC}"
    echo -e "${BLUE}Select security level (1-5):${NC}"
    echo ""
    echo -e "${RED}Level 1${NC} - No AI Security (Basic web security only)"
    echo -e "${YELLOW}Level 2${NC} - Input Validation (Jailbreak & prompt injection filtering)"
    echo -e "${YELLOW}Level 3${NC} - AI-Powered Input Analysis (Advanced threat scoring)"  
    echo -e "${YELLOW}Level 4${NC} - Output Content Moderation (AI-powered output filtering)"
    echo -e "${YELLOW}Level 5${NC} - Full AI Security Suite (All layers combined)"
    echo ""
    echo -e "${CYAN}Note: This is for educational demonstration of AI security vulnerabilities${NC}"
    echo ""
    
    while true; do
        read -p "$(echo -e ${BLUE}Choose security level [1-5]:${NC} )" security_level
        
        case $security_level in
            1|2|3|4|5)
                echo -e "${GREEN}Selected Security Level: $security_level${NC}"
                export AI_SECURITY_LEVEL=$security_level
                echo "AI_SECURITY_LEVEL=$security_level" > .security_level
                return 0
                ;;
            *)
                echo -e "${RED}Invalid option. Please choose 1-5.${NC}"
                ;;
        esac
    done
}

# Main menu loop
main_menu() {
    while true; do
        show_hardware_menu
        
        if [ -n "$DETECTED_HARDWARE" ]; then
            echo -e "${CYAN}Auto-detected hardware: ${DETECTED_HARDWARE^^}${NC}"
            echo ""
        fi
        
        read -p "$(echo -e ${BLUE}Choose an option [1-9]:${NC} )" choice
        
        case $choice in
            1)
                if check_prerequisites "cpu" && setup_configuration "cpu"; then
                    if select_model "cpu"; then
                        launch_services "cpu"
                        break
                    fi
                fi
                ;;
            2)
                if check_prerequisites "nvidia" && setup_configuration "nvidia"; then
                    if select_model "nvidia"; then
                        launch_services "nvidia"
                        break
                    fi
                fi
                ;;
            3)
                if check_prerequisites "amd" && setup_configuration "amd"; then
                    if select_model "amd"; then
                        launch_services "amd"
                        break
                    fi
                fi
                ;;
            4)
                echo -e "${BLUE}Starting hybrid mode...${NC}"
                if [ -x "./utils/start_hybrid.sh" ]; then
                    echo "hybrid" > .current_hardware_config
                    if select_model "hybrid"; then
                        ./utils/start_hybrid.sh
                        break
                    fi
                else
                    echo -e "${RED}utils/start_hybrid.sh not found or not executable!${NC}"
                fi
                ;;
            5)
                # Cloud hybrid mode using docker-compose.cloud.yml
                echo -e "${BLUE}Starting cloud hybrid mode...${NC}"
                if [ -f "docker-compose.cloud.yml" ]; then
                    # Ask user for connection type
                    echo ""
                    echo -e "${PURPLE}Cloud Connection Type:${NC}"
                    echo -e "${GREEN}1) Tailscale${NC}     - Connect via Tailscale VPN (secure, auto-discovery)"
                    echo -e "${GREEN}2) Direct HTTPS${NC}  - Connect via direct HTTPS URL (e.g., tunneled/proxied)"
                    echo ""
                    
                    cloud_url=""
                    while true; do
                        read -p "$(echo -e ${BLUE}Select connection type [1-2]:${NC} )" connection_type
                        
                        case $connection_type in
                            1)
                                # Tailscale mode with dynamic tailnet detection
                                echo -e "${CYAN}Using Tailscale connection...${NC}"

                                # Discover MagicDNS suffix and candidate peers if possible
                                magic_suffix=""
                                auto_dns=""
                                auto_host=""
                                auto_ip=""
                                if command -v tailscale >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
                                    magic_suffix=$(tailscale status --json 2>/dev/null | jq -r '.MagicDNSSuffix // ""' | sed 's/\.$//')
                                    auto_dns=$(tailscale status --json 2>/dev/null | jq -r '.Peer[] | select(.HostName | startswith("ollama-lab")) | select(.Online == true) | .DNSName' | head -1 | sed 's/\.$//')
                                    if [ -n "$auto_dns" ]; then
                                        auto_host=$(echo "$auto_dns" | cut -d'.' -f1)
                                    fi
                                    auto_ip=$(tailscale status --json 2>/dev/null | jq -r '.Peer[] | select(.HostName | startswith("ollama-lab")) | select(.Online == true) | .TailscaleIPs[0]' | head -1)
                                fi

                                # Determine target input (env var > autodetect > prompt)
                                tailscale_host=""
                                if [ -n "$TAILSCALE_HOST" ]; then
                                    echo -e "${GREEN}Using TAILSCALE_HOST from environment: ${TAILSCALE_HOST}${NC}"
                                    tailscale_host="$TAILSCALE_HOST"
                                else
                                    echo -e "${CYAN}Cloud mode requires a Tailscale endpoint for remote Ollama access.${NC}"
                                    if [ -n "$auto_dns" ] || [ -n "$auto_ip" ]; then
                                        # Offer choices based on autodiscovery
                                        [ -n "$auto_dns" ] && echo -e "${GREEN}Auto-detected FQDN: ${auto_dns}${NC}"
                                        [ -n "$auto_ip" ] && echo -e "${GREEN}Auto-detected IP:   ${auto_ip}${NC}"
                                        echo -e "${YELLOW}Use FQDN (1), IP address (2), or manual entry (3)? [1]:${NC}"
                                        read -p "" choice
                                        case "$choice" in
                                            2)
                                                tailscale_host="$auto_ip"
                                                echo -e "${BLUE}Using IP address: ${tailscale_host}${NC}"
                                                ;;
                                            3)
                                                ;;
                                            *)
                                                tailscale_host="$auto_dns"
                                                echo -e "${BLUE}Using FQDN: ${tailscale_host}${NC}"
                                                ;;
                                        esac
                                    fi

                                    if [ -z "$tailscale_host" ]; then
                                        echo -e "${YELLOW}Enter your Tailscale hostname, FQDN, IP, or full HTTPS URL:${NC}"
                                        echo -e "   - Short hostname (e.g., 'ollama-lab-8x7-2')"
                                        echo -e "   - FQDN (e.g., 'ollama-lab-8x7-2.${magic_suffix:-<tailnet>.ts.net}')"
                                        echo -e "   - Tailscale IP (e.g., '100.x.x.x')"
                                        echo -e "   - Full URL (e.g., 'https://host.${magic_suffix:-tail123.ts.net}')"
                                        read -p "Tailscale target: " tailscale_host
                                        if [ -z "$tailscale_host" ]; then
                                            echo -e "${RED}A Tailscale target is required for Tailscale mode.${NC}"
                                            continue
                                        fi
                                    fi
                                fi

                                # Normalize and build cloud_url
                                input="$tailscale_host"
                                # Strip trailing dot if present
                                input="${input%.}"
                                if [[ "$input" =~ ^https?:// ]]; then
                                    cloud_url="$input"
                                elif [[ "$input" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                                    cloud_url="https://${input}"
                                else
                                    if [[ "$input" == *.* ]]; then
                                        # Looks like FQDN already
                                        cloud_url="https://${input}"
                                    else
                                        # Short hostname -> append MagicDNS suffix if available
                                        if [ -n "$magic_suffix" ]; then
                                            cloud_url="https://${input}.${magic_suffix}"
                                        else
                                            echo -e "${YELLOW}Could not determine your tailnet domain automatically.${NC}"
                                            echo -e "${YELLOW}Please enter the full HTTPS URL for your Tailscale Serve endpoint (e.g., https://host.tailNNNN.ts.net).${NC}"
                                            while true; do
                                                read -p "HTTPS URL: " https_url
                                                if [[ -n "$https_url" && "$https_url" =~ ^https:// ]]; then
                                                    cloud_url="$https_url"
                                                    break
                                                fi
                                                echo -e "${RED}URL must start with 'https://' and not be empty.${NC}"
                                            done
                                        fi
                                    fi
                                fi

                                echo -e "${GREEN}Tailscale URL: ${cloud_url}${NC}"
                                break
                                ;;
                            2)
                                # Direct HTTPS mode
                                echo -e "${CYAN}Using direct HTTPS connection...${NC}"
                                echo ""
                                echo -e "${YELLOW}Enter the HTTPS URL for your remote Ollama instance:${NC}"
                                echo -e "${BLUE}Examples:${NC}"
                                echo -e "  • https://my-ollama-server.example.com"
                                echo -e "  • https://ollama.mydomain.net:8080" 
                                echo -e "  • https://tunnel-12345.ngrok.io"
                                echo ""
                                
                                while true; do
                                    read -p "HTTPS URL: " https_url
                                    
                                    if [ -z "$https_url" ]; then
                                        echo -e "${RED}HTTPS URL is required for direct mode.${NC}"
                                        continue
                                    fi
                                    
                                    # Basic URL validation
                                    if [[ ! "$https_url" =~ ^https:// ]]; then
                                        echo -e "${RED}URL must start with 'https://'${NC}"
                                        continue
                                    fi
                                    
                                    cloud_url="$https_url"
                                    echo -e "${GREEN}Direct HTTPS URL: ${cloud_url}${NC}"
                                    break
                                done
                                break
                                ;;
                            *)
                                echo -e "${RED}Invalid option. Please choose 1 or 2.${NC}"
                                ;;
                        esac
                    done
                    
                    # Update docker-compose.yml with the cloud URL
                    echo -e "${BLUE}Creating docker-compose.yml with cloud URL: ${cloud_url}${NC}"
                    cp docker-compose.cloud.yml docker-compose.yml
                    
                    # Replace the placeholder with the full HTTPS URL (works for any tailnet or direct URL)
                    sed -i "s|OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=${cloud_url}|g" docker-compose.yml

                    # Use cloud compose as active (already copied above)
                    echo "cloud" > .current_hardware_config
                    if select_model "cloud"; then
                        launch_services "cloud"
                        break
                    fi
                else
                    echo -e "${RED}docker-compose.cloud.yml not found in the repo.${NC}"
                fi
                ;;
            6)
                # Custom Ollama URL mode
                echo -e "${BLUE}Starting custom Ollama URL mode...${NC}"
                if [ -f "docker-compose.custom.yml" ]; then
                    echo -e "${CYAN}This mode allows you to connect to Ollama at any custom URL.${NC}"
                    echo ""
                    
                    # Prompt for protocol
                    echo -e "${YELLOW}Select protocol:${NC}"
                    echo "  1) http://"
                    echo "  2) https://"
                    read -p "$(echo -e ${BLUE}Choose protocol [1-2, default=1]:${NC} )" protocol_choice
                    
                    case "$protocol_choice" in
                        2)
                            protocol="https"
                            ;;
                        *)
                            protocol="http"
                            ;;
                    esac
                    
                    # Prompt for host
                    echo ""
                    read -p "$(echo -e ${BLUE}Enter Ollama hostname or IP address [default=localhost]:${NC} )" ollama_host
                    if [ -z "$ollama_host" ]; then
                        ollama_host="localhost"
                    fi
                    
                    # Prompt for port
                    echo ""
                    read -p "$(echo -e ${BLUE}Enter Ollama port [default=11434]:${NC} )" ollama_port
                    if [ -z "$ollama_port" ]; then
                        ollama_port="11434"
                    fi
                    
                    # Construct full URL
                    custom_ollama_url="${protocol}://${ollama_host}:${ollama_port}"
                    
                    echo ""
                    echo -e "${GREEN}Custom Ollama URL: ${custom_ollama_url}${NC}"
                    echo ""
                    read -p "$(echo -e ${YELLOW}Is this correct? [Y/n]:${NC} )" confirm
                    
                    if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
                        echo -e "${YELLOW}Cancelled. Returning to menu...${NC}"
                        continue
                    fi
                    
                    # Test connection
                    echo -e "${BLUE}Testing connection to ${custom_ollama_url}...${NC}"
                    if curl -f --connect-timeout 5 --max-time 10 "${custom_ollama_url}/api/tags" >/dev/null 2>&1; then
                        echo -e "${GREEN}✓ Successfully connected to Ollama!${NC}"
                    else
                        echo -e "${YELLOW}⚠ Warning: Could not connect to ${custom_ollama_url}${NC}"
                        echo -e "${YELLOW}  Make sure Ollama is running at that address.${NC}"
                        echo ""
                        read -p "$(echo -e ${YELLOW}Continue anyway? [y/N]:${NC} )" continue_anyway
                        if [[ ! "$continue_anyway" =~ ^[Yy]$ ]]; then
                            echo -e "${YELLOW}Cancelled. Returning to menu...${NC}"
                            continue
                        fi
                    fi
                    
                    # Update docker-compose.yml with the custom URL
                    echo -e "${BLUE}Creating docker-compose.yml with custom Ollama URL...${NC}"
                    cp docker-compose.custom.yml docker-compose.yml
                    sed -i "s|REPLACE_WITH_CUSTOM_OLLAMA_URL|${custom_ollama_url}|g" docker-compose.yml
                    
                    # Save configuration
                    echo "custom" > .current_hardware_config
                    echo "$custom_ollama_url" > .custom_ollama_url
                    
                    if select_model "custom"; then
                        launch_services "custom"
                        break
                    fi
                else
                    echo -e "${RED}docker-compose.custom.yml not found!${NC}"
                fi
                ;;
            7)
                if [ -n "$DETECTED_HARDWARE" ]; then
                    echo -e "${BLUE}Using auto-detected hardware: ${DETECTED_HARDWARE^^}${NC}"
                    if check_prerequisites "$DETECTED_HARDWARE" && setup_configuration "$DETECTED_HARDWARE"; then
                        if select_model "$DETECTED_HARDWARE"; then
                            launch_services "$DETECTED_HARDWARE"
                            break
                        fi
                    fi
                else
                    echo -e "${RED}Could not auto-detect hardware. Please choose manually.${NC}"
                fi
                ;;
            8)
                show_current_config
                echo ""
                ;;
            9)
                echo -e "${BLUE}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option. Please choose 1-9.${NC}"
                ;;
        esac
        
        echo ""
        read -p "$(echo -e ${BLUE}Press Enter to return to menu...${NC})"
        clear
    done
}

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Docker is not running or not accessible!${NC}"
    echo -e "   Please start Docker or run with sudo"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker &> /dev/null || ! docker compose --help &> /dev/null; then
    echo -e "${RED}Docker Compose is not available!${NC}"
    echo -e "   Please install Docker Compose"
    exit 1
fi

# Detect hardware
detect_hardware

# Start main menu
clear
main_menu
