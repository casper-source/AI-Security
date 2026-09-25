#!/usr/bin/env bash
set -euo pipefail

# One-shot first-run helper
# - Initializes the database with sample data
# - Forces RAG vector index rebuild
# - Performs quick health checks against the web app and Ollama
# Prints a concise pass/fail summary

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok_count=0
fail_count=0
results=()

echo -e "${YELLOW}Running first-run checks in: ${ROOT_DIR}${NC}"

run_in_container() {
  # $1 = service/container name (chatbot)
  # $2 = command to run
  local svc="$1" cmd="$2"
  if docker compose ps --format json 2>/dev/null | jq -r '.State' | grep -q "running" 2>/dev/null; then
    # Prefer target service name if present
    if docker ps --format '{{.Names}}' | grep -q "$svc"; then
      docker exec -i "$svc" /bin/sh -c "$cmd"
      return $?
    fi
    # Try docker compose exec
    if docker compose ps --format table 2>/dev/null | grep -q "$svc"; then
      docker compose exec "$svc" /bin/sh -c "$cmd"
      return $?
    fi
  fi

  return 2
}

echo "\n1) Initialize database with sample data"
if docker compose ps --format json 2>/dev/null | jq -r '.State' | grep -q "running" 2>/dev/null; then
  # Try to run inside running chatbot container
  chatbot_container=$(docker ps --format '{{.Names}}' | grep -m1 'nlt_chatbot\|chatbot' || true)
  if [ -n "$chatbot_container" ]; then
    echo " - Running init_database inside container: $chatbot_container"
    if docker exec -i "$chatbot_container" python3 -m scripts.init_database; then
      echo -e "${GREEN}   Database initialized inside container${NC}"
      results+=("DB:init:OK")
      ok_count=$((ok_count+1))
    else
      echo -e "${RED}   Database init FAILED inside container${NC}"
      results+=("DB:init:FAIL")
      fail_count=$((fail_count+1))
    fi
  else
    echo " - No chatbot container detected, falling back to host execution"
    if python3 scripts/init_database.py; then
      echo -e "${GREEN}   Database initialized on host${NC}"
      results+=("DB:init:OK")
      ok_count=$((ok_count+1))
    else
      echo -e "${RED}   Database init FAILED on host${NC}"
      results+=("DB:init:FAIL")
      fail_count=$((fail_count+1))
    fi
  fi
else
  # No docker services running; attempt host execution
  echo " - Docker compose not running; attempting host execution"
  if python3 scripts/init_database.py; then
    echo -e "${GREEN}   Database initialized on host${NC}"
    results+=("DB:init:OK")
    ok_count=$((ok_count+1))
  else
    echo -e "${RED}   Database init FAILED on host${NC}"
    results+=("DB:init:FAIL")
    fail_count=$((fail_count+1))
  fi
fi

echo "\n2) Force RAG vector index rebuild (if vector search enabled)"
chatbot_container=$(docker ps --format '{{.Names}}' | grep -m1 'nlt_chatbot\|chatbot' || true)
reindex_cmd_python="from scripts.rag_helper import RAGHelper; rag=RAGHelper(use_vector_search=True); print(rag.ensure_vector_index(force_reindex=True))"

if [ -n "$chatbot_container" ]; then
  echo " - Running reindex inside container: $chatbot_container"
  if docker exec -i "$chatbot_container" python3 -c "$reindex_cmd_python"; then
    echo -e "${GREEN}   RAG reindex succeeded inside container${NC}"
    results+=("RAG:reindex:OK")
    ok_count=$((ok_count+1))
  else
    echo -e "${RED}   RAG reindex FAILED inside container${NC}"
    results+=("RAG:reindex:FAIL")
    fail_count=$((fail_count+1))
  fi
  else
    echo " - No chatbot container detected, attempting host reindex"
    if python3 -c "from scripts.rag_helper import RAGHelper; rag=RAGHelper(use_vector_search=True); print(rag.ensure_vector_index(force_reindex=True))"; then
    echo -e "${GREEN}   RAG reindex succeeded on host${NC}"
    results+=("RAG:reindex:OK")
    ok_count=$((ok_count+1))
  else
    echo -e "${RED}   RAG reindex FAILED on host${NC}"
    results+=("RAG:reindex:FAIL")
    fail_count=$((fail_count+1))
  fi
fi

echo "\n3) Quick health checks: web app and Ollama"
health_ok=true

# Web app health
echo " - Checking web app health (http://localhost:5000/api/health)"
if curl -s --fail http://localhost:5000/api/health -m 10 >/dev/null; then
  echo -e "${GREEN}   Web app responded${NC}"
  results+=("WEB:health:OK")
  ok_count=$((ok_count+1))
else
  echo -e "${RED}   Web app did not respond${NC}"
  results+=("WEB:health:FAIL")
  fail_count=$((fail_count+1))
  health_ok=false
fi

# Ollama health
echo " - Checking Ollama health (http://localhost:11434/api/tags)"
if curl -s --fail http://localhost:11434/api/tags -m 8 >/dev/null; then
  echo -e "${GREEN}   Ollama API reachable${NC}"
  # list models briefly
  echo "   Models loaded:" 
  curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null | sed 's/^/     - /' || true
  results+=("OLLAMA:api:OK")
  ok_count=$((ok_count+1))
else
  echo -e "${RED}   Ollama API not reachable on localhost:11434${NC}"
  results+=("OLLAMA:api:FAIL")
  fail_count=$((fail_count+1))
  health_ok=false
fi

echo "\nSummary:\n"
for r in "${results[@]}"; do
  if [[ "$r" == *":OK" ]]; then
    echo -e "${GREEN} ✔ $r${NC}"
  else
    echo -e "${RED} ✖ $r${NC}"
  fi
done

echo "\nPassed: $ok_count, Failed: $fail_count"

if [ "$fail_count" -eq 0 ]; then
  echo -e "${GREEN}First-run checks succeeded.${NC}"
  exit 0
else
  echo -e "${YELLOW}Some checks failed. Review messages above and run the suggested commands.${NC}"
  exit 2
fi
