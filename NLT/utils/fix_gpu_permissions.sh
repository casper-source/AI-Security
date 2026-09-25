#!/bin/bash

echo "🔧 Fixing GPU permissions for Ollama..."
echo "======================================="

# Add user to render group if not already added
if ! groups | grep -q render; then
    echo "Adding user to render group..."
    sudo usermod -aG render $USER
    echo "✅ User added to render group"
else
    echo "✅ User already in render group"
fi

echo ""
echo "🔄 To apply group changes, you need to:"
echo "   1. Log out and log back in, OR"
echo "   2. Use this command to test GPU access:"
echo "      sg render -c 'OLLAMA_HOST=0.0.0.0:11434 ollama serve'"
echo ""
echo "📊 Current GPU information:"
echo "   Device: $(lspci | grep -i display)"
echo "   KFD device: $(ls -la /dev/kfd)"
echo ""
echo "🎯 Expected outcome after restart:"
echo "   - AMD GPU (gfx1151) will be detected and accessible"
echo "   - Ollama will use ROCm for GPU acceleration"
echo "   - Much faster inference times compared to CPU-only mode"
echo ""
echo "💡 Test GPU access with:"
echo "   OLLAMA_DEBUG=1 sg render -c 'ollama run llama3.2:1b \"test\"'"
