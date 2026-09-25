#!/bin/bash

echo "🚀 Setting up Native Ollama with ROCm GPU support..."
echo "==============================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root for security reasons"
   echo "💡 Run as regular user, sudo will be used when needed"
   exit 1
fi

# Check if ROCm is installed
echo "🔍 Checking for ROCm installation..."
if ! command -v rocm-smi &> /dev/null; then
    echo "❌ ROCm not found. Please install ROCm first:"
    echo "   Ubuntu/Debian: https://docs.amd.com/bundle/ROCm-Installation-Guide-v5.4.3"
    echo "   Arch: sudo pacman -S rocm-opencl-runtime rocm-smi-lib"
    exit 1
fi

# Check GPU
echo "🎮 Checking AMD GPU..."
if ! rocm-smi &> /dev/null; then
    echo "❌ No AMD GPU detected or ROCm not properly configured"
    echo "💡 Make sure your user is in the 'render' and 'video' groups:"
    echo "   sudo usermod -a -G render,video $USER"
    echo "   Then log out and back in"
    exit 1
fi

echo "✅ AMD GPU detected:"
rocm-smi --showid --showproductname

# Check if Ollama is already installed
if command -v ollama &> /dev/null; then
    echo "⚠️  Ollama is already installed. Checking version..."
    ollama --version
    read -p "Do you want to continue and reconfigure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting..."
        exit 0
    fi
fi

# Install Ollama natively
echo "📥 Installing Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh

# Wait for installation to complete
sleep 2

# Check if Ollama was installed successfully
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama installation failed"
    exit 1
fi

echo "✅ Ollama installed successfully"

# Configure ROCm environment for Ollama
echo "⚙️ Configuring Ollama for AMD GPU..."

# Create Ollama configuration directory
mkdir -p ~/.config/ollama

# Set up environment variables for ROCm
cat > ~/.config/ollama/environment << EOF
# AMD ROCm Configuration for Ollama
HSA_OVERRIDE_GFX_VERSION=11.0.0
HIP_VISIBLE_DEVICES=0
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_GPU_OVERHEAD=0
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_MAX_QUEUE=128
OLLAMA_NUM_PARALLEL=4
OLLAMA_FLASH_ATTENTION=1
EOF

# Create systemd user service for Ollama (if systemd is available)
if command -v systemctl &> /dev/null; then
    echo "🔧 Creating systemd user service for Ollama..."
    
    mkdir -p ~/.config/systemd/user
    
    cat > ~/.config/systemd/user/ollama.service << EOF
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
Type=exec
ExecStart=/usr/local/bin/ollama serve
Environment="HSA_OVERRIDE_GFX_VERSION=11.0.0"
Environment="HIP_VISIBLE_DEVICES=0"
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_GPU_OVERHEAD=0"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_MAX_QUEUE=128"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_FLASH_ATTENTION=1"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

    # Reload systemd and enable the service
    systemctl --user daemon-reload
    systemctl --user enable ollama.service
    
    echo "✅ Systemd service created and enabled"
    echo "💡 To start: systemctl --user start ollama"
    echo "💡 To stop:  systemctl --user stop ollama"
fi

# Test Ollama installation
echo "🧪 Testing Ollama installation..."

# Export environment variables for this session
export HSA_OVERRIDE_GFX_VERSION=11.0.0
export HIP_VISIBLE_DEVICES=0
export OLLAMA_HOST=0.0.0.0:11434

# Start Ollama in background for testing
echo "🚀 Starting Ollama..."
ollama serve > /tmp/ollama.log 2>&1 &
OLLAMA_PID=$!

# Wait for Ollama to start
echo "⏳ Waiting for Ollama to start..."
for i in {1..30}; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✅ Ollama is running successfully!"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo "❌ Ollama failed to start. Check /tmp/ollama.log for details"
        kill $OLLAMA_PID 2>/dev/null
        exit 1
    fi
done

# Test GPU detection
echo "🎮 Testing GPU detection..."
if curl -s http://localhost:11434/api/tags | grep -q "models"; then
    echo "✅ Ollama API is responding"
    
    # Try to pull a small model to test GPU
    echo "📥 Testing GPU with a small model..."
    ollama pull llama3.2:1b
    
    if [ $? -eq 0 ]; then
        echo "✅ GPU model download successful!"
        
        # Test inference
        echo "🧪 Testing GPU inference..."
        response=$(ollama run llama3.2:1b "Say hello" --verbose 2>&1)
        if echo "$response" | grep -q "total duration"; then
            echo "✅ GPU inference test successful!"
            echo "📊 Performance info:"
            echo "$response" | grep -E "(total duration|load duration|eval duration)"
        else
            echo "⚠️  Inference completed but performance info not available"
        fi
    else
        echo "⚠️  Model download had issues, but Ollama is running"
    fi
else
    echo "❌ Ollama API not responding properly"
fi

# Clean up test process
kill $OLLAMA_PID 2>/dev/null
wait $OLLAMA_PID 2>/dev/null

echo ""
echo "🎉 Native Ollama setup complete!"
echo "================================"
echo ""
echo "🚀 To start Ollama manually:"
echo "   ollama serve"
echo ""
echo "🚀 To start with systemd (recommended):"
echo "   systemctl --user start ollama"
echo ""
echo "📥 To pull the NLT chatbot model:"
echo "   ollama pull llama2:13b"
echo ""
echo "🔧 Configuration location: ~/.config/ollama/environment"
echo "📋 Log location (manual): /tmp/ollama.log"
echo "📋 Log location (systemd): journalctl --user -u ollama -f"
echo ""
echo "💡 Next steps:"
echo "   1. Start Ollama: systemctl --user start ollama"
echo "   2. Pull model: ollama pull llama2:13b"
echo "   3. Run hybrid setup: ./utils/start_hybrid.sh"
echo ""
