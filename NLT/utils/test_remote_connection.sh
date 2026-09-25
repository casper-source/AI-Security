#!/bin/bash

# Check if remote Ollama model is loaded and test chat functionality

echo "🔍 Checking remote Ollama model status..."

# Check if model is loaded
MODELS=$(curl -s https://ollama-lab.tail21af23.ts.net/api/ps | jq -r '.models | length' 2>/dev/null || echo "0")

if [ "$MODELS" = "0" ]; then
    echo "❌ Model not loaded yet. The mixtral:8x22b model is very large (~87GB) and may take 5-10 minutes to load."
    echo "   You can check status with: curl -s https://ollama-lab.tail21af23.ts.net/api/ps"
    exit 1
fi

echo "✅ Found $MODELS model(s) loaded:"
curl -s https://ollama-lab.tail21af23.ts.net/api/ps | jq -r '.models[] | "   • \(.name) - \(.size_vram) VRAM"'

echo ""
echo "🧪 Testing local chatbot connectivity..."

# Test local chatbot
RESPONSE=$(timeout 30 curl -s -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, testing remote connection", "conversation_id": null}' 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$RESPONSE" ]; then
    echo "✅ Chatbot responded successfully!"
    echo "Response preview:" 
    echo "$RESPONSE" | jq -r '.response' 2>/dev/null | head -c 200
    echo "..."
else
    echo "❌ Chatbot test failed or timed out"
    echo "Check container logs with: docker logs nlt_chatbot_cloud"
fi