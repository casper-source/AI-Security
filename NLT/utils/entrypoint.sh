#!/bin/bash

# Docker startup script for NodeLine Tech Chatbot
set -e

echo "Starting NodeLine Tech Chatbot Docker Container..."

# Disable Chroma/PostHog telemetry to avoid runtime errors and outbound calls
export ANONYMIZED_TELEMETRY=False
export CHROMA_TELEMETRY_ENABLED=false
export CHROMADB_TELEMETRY_DISABLED=true
export POSTHOG_DISABLED=true

# Create necessary directories and set permissions
mkdir -p /app/data/transformers_cache
mkdir -p /app/data/huggingface_cache
mkdir -p /app/vector_db
# chown -R appuser:appuser /app/data /app/vector_db  # Commented out to avoid permission issues

# Wait for Ollama service to be ready
echo "Waiting for Ollama service to be ready..."
OLLAMA_URL=${OLLAMA_BASE_URL:-http://ollama:11434}

# Set timeout based on whether we're using HTTPS (cloud mode) or HTTP (local)
if [[ "$OLLAMA_URL" == https://* ]]; then
    echo "Detected cloud/HTTPS mode, using longer timeout..."
    CURL_TIMEOUT="--connect-timeout 10 --max-time 30"
    MAX_ATTEMPTS=10
else
    echo "Detected local/HTTP mode, using standard timeout..."
    CURL_TIMEOUT="--connect-timeout 5 --max-time 10"
    MAX_ATTEMPTS=24
fi

ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -f $CURL_TIMEOUT ${OLLAMA_URL}/api/tags >/dev/null 2>&1; then
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "   Ollama not ready yet, attempt $ATTEMPT/$MAX_ATTEMPTS, waiting 5 seconds... (trying ${OLLAMA_URL})"
    sleep 5
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "ERROR: Could not connect to Ollama service at ${OLLAMA_URL} after $MAX_ATTEMPTS attempts"
    echo "This may indicate:"
    echo "  - Ollama service is not running"
    echo "  - Network connectivity issues"
    echo "  - Incorrect OLLAMA_BASE_URL configuration"
    echo ""
    echo "For cloud mode, ensure:"
    echo "  1. Remote Ollama host is running and accessible via Tailscale"
    echo "  2. Tailscale Serve is properly configured on the remote host"
    echo "  3. OLLAMA_BASE_URL points to the correct Tailscale hostname"
    echo ""
    echo "Continuing anyway - the web app may still work if Ollama becomes available later..."
else
    echo "Ollama service is ready!"
fi

# Check if any models are available
echo "Checking for available models..."
MODELS=$(timeout 30 curl -s $CURL_TIMEOUT ${OLLAMA_URL}/api/tags | jq -r '.models | length' 2>/dev/null || echo "0")

if [ "$MODELS" = "0" ]; then
    echo "No models found or could not check models. You may want to:"
    if [[ "$OLLAMA_URL" == https://* ]]; then
        echo "   1. Ensure models are pulled on your remote Ollama host"
        echo "   2. Check Tailscale connectivity to the remote host"
    else
        echo "   1. Pull some models: docker exec <ollama-container> ollama pull llama2"
        echo "   2. Check if Ollama service is properly running"
    fi
else
    echo "Found $MODELS model(s) available"
fi

# Check for selected model and auto-pull if needed
if [ -f "/app/.selected_model" ]; then
    SELECTED_MODEL=$(cat /app/.selected_model | tr -d '[:space:]')
    if [ -n "$SELECTED_MODEL" ]; then
        echo "Configured model: $SELECTED_MODEL"
        
        # Check if the selected model is already available
        MODEL_EXISTS=$(timeout 30 curl -s $CURL_TIMEOUT ${OLLAMA_URL}/api/tags | jq -r ".models[].name" 2>/dev/null | grep -x "$SELECTED_MODEL" || echo "")
        
        if [ -z "$MODEL_EXISTS" ]; then
            echo "Selected model '$SELECTED_MODEL' not found locally."
            
            if [[ "$OLLAMA_URL" == https://* ]]; then
                echo "Cloud mode detected - model must be pulled on remote Ollama host"
                echo "Please SSH to your remote host and run: ollama pull $SELECTED_MODEL"
            else
                echo "Attempting to pull model '$SELECTED_MODEL' (this may take several minutes)..."
                # Use curl to trigger model pull via Ollama API
                PULL_RESPONSE=$(curl -s -X POST $CURL_TIMEOUT ${OLLAMA_URL}/api/pull -d "{\"name\":\"$SELECTED_MODEL\"}" 2>&1)
                
                if [ $? -eq 0 ]; then
                    echo "Model pull initiated successfully"
                    # Wait a bit for pull to start
                    sleep 5
                    
                    # Verify model is now available (with retry for large models)
                    PULL_ATTEMPTS=0
                    MAX_PULL_ATTEMPTS=60
                    while [ $PULL_ATTEMPTS -lt $MAX_PULL_ATTEMPTS ]; do
                        MODEL_EXISTS=$(timeout 30 curl -s $CURL_TIMEOUT ${OLLAMA_URL}/api/tags | jq -r ".models[].name" 2>/dev/null | grep -x "$SELECTED_MODEL" || echo "")
                        if [ -n "$MODEL_EXISTS" ]; then
                            echo "Model '$SELECTED_MODEL' is now available!"
                            break
                        fi
                        PULL_ATTEMPTS=$((PULL_ATTEMPTS + 1))
                        echo "Waiting for model pull to complete... ($PULL_ATTEMPTS/$MAX_PULL_ATTEMPTS)"
                        sleep 10
                    done
                    
                    if [ -z "$MODEL_EXISTS" ]; then
                        echo "WARNING: Model pull may still be in progress. Check Ollama container logs."
                    fi
                else
                    echo "WARNING: Failed to pull model. Error: $PULL_RESPONSE"
                    echo "You can manually pull it later with: docker exec <ollama-container> ollama pull $SELECTED_MODEL"
                fi
            fi
        else
            echo "Selected model '$SELECTED_MODEL' is already available"
        fi
    fi
fi

echo "Initializing database..."

# Set default database path if not provided
export DATABASE_PATH=${DATABASE_PATH:-/app/data/nlt_chatbot.db}

# Debug information
echo "Database path: $DATABASE_PATH"
echo "Current user: $(whoami)"
echo "Current user ID: $(id)"
echo "Current directory: $(pwd)"
echo "App directory permissions:"
ls -la /app/

# Create data directory if it doesn't exist
echo "Creating data directory..."
mkdir -p /app/data
echo "Data directory created/verified"
echo "Data directory permissions:"
ls -la /app/data/

# Check if database exists and has content
echo "Checking database status..."
DB_NEEDS_INIT=false

if [ ! -f "$DATABASE_PATH" ]; then
    echo "Database file not found, will initialize with sample data..."
    DB_NEEDS_INIT=true
else
    echo "Database file exists, checking if it has data..."
    # Check if database has any users (indicates it's been properly initialized)
    USER_COUNT=$(python -c "import sqlite3; conn = sqlite3.connect('$DATABASE_PATH'); cursor = conn.cursor(); cursor.execute('SELECT COUNT(*) FROM users'); print(cursor.fetchone()[0]); conn.close()" 2>/dev/null || echo "0")
    
    if [ "$USER_COUNT" = "0" ]; then
        echo "Database exists but has no users, will initialize..."
        DB_NEEDS_INIT=true
    else
        echo "Database already initialized with $USER_COUNT user(s)"
    fi
fi

# Initialize database if needed
if [ "$DB_NEEDS_INIT" = "true" ]; then
    echo "Initializing database with sample data..."
    if python -m scripts.init_database; then
        echo "Database initialization successful"
    else
        echo "Database initialization failed!"
        echo "Directory contents:"
        ls -la /app/data/
        echo "Environment variables:"
        env | grep DATABASE
        exit 1
    fi
fi

echo "Final database check:"
ls -la "$DATABASE_PATH" 2>/dev/null || echo "Database file not found"

echo "Final database check:"
ls -la "$DATABASE_PATH" 2>/dev/null || echo "Database file not found"

# Final permission fix for vector database (as appuser)
# if [ -d "/app/vector_db" ]; then
#     echo "Fixing vector_db permissions..."
#     sudo chown -R appuser:appuser /app/vector_db 2>/dev/null || echo "Could not change vector_db ownership (continuing anyway)"
# fi

echo "Starting Flask application..."
exec python app.py
