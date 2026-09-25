#!/bin/bash

# Model Health Checker - Detects and fixes corrupted Ollama models
# Usage: ./model_health_checker.sh [model_name]

# Get the currently configured model from the app's configuration
get_current_model() {
    # Check if a model is provided as parameter
    if [ -n "$1" ]; then
        echo "$1"
        return
    fi
    
    # Try to read from the .selected_model file (same as app.py uses)
    if [ -f "../.selected_model" ]; then
        model=$(cat "../.selected_model" 2>/dev/null | tr -d '\n' | tr -d '\r')
        if [ -n "$model" ]; then
            echo "$model"
            return
        fi
    fi
    
    # Check from current directory as well
    if [ -f ".selected_model" ]; then
        model=$(cat ".selected_model" 2>/dev/null | tr -d '\n' | tr -d '\r')
        if [ -n "$model" ]; then
            echo "$model"
            return
        fi
    fi
    
    # Fallback to default
    echo "llama3.2:3b"
}

MODEL_NAME=$(get_current_model "$1")
OLLAMA_URL="http://localhost:11434"
LOG_FILE="/tmp/model_health.log"

echo "🔍 Checking health of model: $MODEL_NAME" | tee -a "$LOG_FILE"

# Test the model with a comprehensive prompt that can detect corruption
test_prompt="You are a helpful customer service representative for NodeLine Tech, a company specializing in cables and connectivity solutions. Please respond professionally to this customer inquiry with helpful information about cables and connectivity solutions. Customer: How can I help you today?"
test_response=$(curl -s -X POST "$OLLAMA_URL/api/generate" \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"$MODEL_NAME\", \"prompt\": \"$test_prompt\", \"stream\": false}" \
    --max-time 180)

if [ $? -ne 0 ]; then
    echo "❌ Model test failed - connection issue" | tee -a "$LOG_FILE"
    exit 1
fi

# Extract the response
response=$(echo "$test_response" | jq -r '.response // empty')

# Check for corruption patterns
if [[ -z "$response" ]]; then
    echo "❌ Model test failed - no response" | tee -a "$LOG_FILE"
    exit 1
elif [[ "$response" =~ ^[A-Z]+$ ]] || [[ "$response" =~ ^[a-z]+$ ]] || [[ "$response" =~ ^[#@]+$ ]] || [[ "$response" =~ ^[*]+$ ]]; then
    echo "❌ Model corruption detected: repetitive characters" | tee -a "$LOG_FILE"
    echo "🔧 Attempting to fix corrupted model..." | tee -a "$LOG_FILE"
    
    # Delete corrupted model
    curl -s -X DELETE "$OLLAMA_URL/api/delete" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$MODEL_NAME\"}"
    
    echo "🔄 Re-downloading fresh model..." | tee -a "$LOG_FILE"
    # Re-download model
    curl -s -X POST "$OLLAMA_URL/api/pull" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$MODEL_NAME\"}" | \
        grep -E "(status|completed)" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ Model successfully repaired" | tee -a "$LOG_FILE"
        exit 0
    else
        echo "❌ Model repair failed" | tee -a "$LOG_FILE"
        exit 1
    fi
elif [[ ${#response} -lt 10 ]] && [[ "$response" =~ ^(.)\1+$ ]]; then
    echo "❌ Model corruption detected: short repetitive response" | tee -a "$LOG_FILE"
    exit 1
else
    echo "✅ Model is healthy: $response" | tee -a "$LOG_FILE"
    exit 0
fi
