# NLT Customer Service Chatbot

An intelligent customer service chatbot system for "NodeLine Tech" powered by Ollama with automatic hardware detection and optimization. Features a complete customer service platform with ticket management, RAG-enhanced knowledge base, and multi-hardware support.

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Hardware: CPU, NVIDIA GPU (+nvidia-container-toolkit), or AMD GPU (+ROCm)

> **Windows users:** the `./launch.sh` flow below assumes a Linux/Mac/WSL environment and its "Cloud" mode has a known networking bug on Docker Desktop for Windows (`network_mode: host` doesn't bridge properly). See **[docs/STUDENT_GUIDE.md](docs/STUDENT_GUIDE.md)** for a Windows-native setup (Docker Desktop + native Ollama) covering both local (`docker-compose.windows-local.yml`) and remote-GPU/RunPod (`docker-compose.windows-cloud.yml`) configurations, and **[docs/INSTRUCTOR_PLAYBOOK.md](docs/INSTRUCTOR_PLAYBOOK.md)** for architecture and lab exercises.

### Start the System

1. **Unzip and navigate**:
   ```bash
   unzip <repository-name>.zip
   cd nlt_chatbot
   ```

2. **Launch and choose hardware**:
   ```bash
   ./launch.sh
   ```
   
   The script can auto-detect your hardware and launch the optimal configuration if you're not sure what to pick.

3. **Access the application**: 
   - Web Interface: http://localhost:5000
   - Admin Panel: http://localhost:5000/admin_tickets

### Stop the System

```bash
# Stop all services
./stop.sh

# Or manually stop based on your configuration
docker compose down
```

### Manual Hardware Configuration
```bash
# CPU-only (universal compatibility)
docker compose -f docker-compose.cpu.yml up -d

# NVIDIA GPU acceleration
docker compose -f docker-compose.nvidia.yml up -d

# AMD GPU acceleration
docker compose -f docker-compose.rocm.yml up -d
```

## Test User Accounts

After running the database initialization, you can use these test accounts to explore the system:

### Admin User
- **Email**: `admin@nodelinetech.com`
- **Password**: `admin123`
- **Access**: Full administrative privileges

### Customer User
- **Email**: `customer@example.com`
- **Password**: `customer123` 
- **Access**: Standard customer features (tickets, chat, etc.)

**Note**: These are test credentials created by the database initialization script. Change the admin password in production environments.

## System Management

### View System Status
```bash
# View real-time logs
docker compose logs -f ollama
docker compose logs -f chatbot


# Pull new models
docker exec nlt_ollama_cpu ollama pull llama2:7b

# Remove models to free space
docker exec nlt_ollama_cpu ollama rm <model-name>
```

### Database Operations

Initialize the database with sample data (creates test users) and run quick queries from the host using `docker compose exec`.

Run the following to create test users inside the running `chatbot` container:

```bash
# Create admin and customer users (executes an inline Python here-doc inside the container)
docker compose exec chatbot python3 - <<'PY'
import sys
sys.path.append('/app/scripts')
from database import DatabaseManager

db = DatabaseManager('/app/data/nlt_customer_service.db')

# Create admin user
admin_id = db.create_user(
   'admin@nodelinetech.com', 'Admin', 'User', 'admin123', company='NodeLine Tech'
)
print('Admin user:', 'created' if admin_id else 'already exists')

# Create customer user
customer_id = db.create_user(
   'customer@example.com', 'John', 'Customer', 'customer123', phone='555-0123', company='Example Corp'
)
print('Customer user:', 'created' if customer_id else 'already exists')
PY
```

Backup the database from the container to the host:

```bash
docker compose exec chatbot cp /app/data/nlt_customer_service.db /tmp/nlt_backup.db
docker cp $(docker compose ps -q chatbot):/tmp/nlt_backup.db ./nlt_customer_service.db.backup
```

View database contents (counts and list users) with an inline Python here-doc:

```bash
docker compose exec chatbot python3 - <<'PY'
import sqlite3
conn = sqlite3.connect('/app/data/nlt_customer_service.db')
cursor = conn.cursor()
cursor.execute('SELECT count(*) FROM users')
print(f'Users: {cursor.fetchone()[0]}')
cursor.execute('SELECT count(*) FROM support_tickets')
print(f'Tickets: {cursor.fetchone()[0]}')
cursor.execute('SELECT email, first_name, last_name FROM users')
users = cursor.fetchall()
print('User accounts:')
for user in users:
   print('-', user[0], user[1], user[2])
conn.close()
PY
```

## System Architecture

### Core Components
- **Flask Web Application**: Customer service interface and admin panels
- **Ollama Service**: LLM inference engine with hardware optimization
- **SQLite Database**: User accounts, tickets, conversations, and knowledge base
- **RAG System**: Vector-based knowledge retrieval with Qdrant (optional)

### Configuration Files
- `docker-compose.nvidia.yml` - NVIDIA GPU acceleration
- `docker-compose.rocm.yml` - AMD GPU support (ROCm)
- `docker-compose.hybrid.yml` - Multi-service setup with vector DB
- `docker-compose.cloud.yml` - Remote Ollama via Tailscale/HTTPS (Linux/Mac hosts)
- `docker-compose.windows-local.yml` - Windows Docker Desktop + native Ollama on the host (see `docs/STUDENT_GUIDE.md`)
- `docker-compose.windows-cloud.yml` - Windows Docker Desktop + remote GPU (e.g. RunPod), configured via `.env` (see `docs/STUDENT_GUIDE.md`)
- `launch.sh` - Interactive hardware detection and startup (Linux/Mac/WSL)
### Directory Structure
nlt_chatbot/
├── app.py                 # Main Flask application
├── scripts/               # Database and utility scripts
├── knowledge_base/        # Company knowledge base files
├── templates/             # HTML templates
├── static/               # CSS, JavaScript, assets
└── utils/                # Deployment and monitoring scripts

## Troubleshooting

### Common Issues

**Services won't start:**
```bash
# Check logs for specific errors
docker compose logs

# Force restart
docker compose down && docker compose up -d
```

**Database not initialized:**
```bash
# Run database initialization
docker compose exec chatbot python scripts/init_database.py
```

**No models available:**
```bash
# Pull a basic model
docker exec nlt_ollama_cpu ollama pull phi3:mini

# Verify model is loaded
docker exec nlt_ollama_cpu ollama list
```

**Can't access web interface:**
- Verify port 5000 is not in use: `lsof -i :5000`
- Check if services are running: `docker compose ps`
- Review logs: `docker compose logs chatbot`

### Hardware-Specific Issues

**AMD GPU not detected:**
- Verify ROCm installation: `rocm-smi`
- Check device permissions: `ls -la /dev/kfd /dev/dri/`
- Fall back to CPU: `docker compose -f docker-compose.cpu.yml up -d`

**NVIDIA GPU issues:**
- Verify nvidia-container-toolkit: `docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi`
- Check GPU availability: `nvidia-smi`

## Customization

### Knowledge Base Management
The system uses a comprehensive knowledge base located in `knowledge_base/`:
- **FAQs**: General customer questions and troubleshooting guides
- **Product Manuals**: Detailed specifications for cables and accessories
- **Policies**: Return, warranty, and shipping information

To update the knowledge base:
```bash
# Edit files in knowledge_base/ directory
# Rebuild the RAG index
docker compose exec chatbot python -c "
from rag_helper import RAGHelper
rag = RAGHelper()
rag.rebuild_index()
"
```

### Customizing the Interface
- **Styling**: Modify `static/style.css` for colors, fonts, and layout
- **Templates**: Edit HTML templates in `templates/` directory
- **Branding**: Update company information in templates and configuration

### Adding New Features
- **New API Endpoints**: Add routes in `app.py`
- **Database Schema**: Modify `scripts/database.py` and run migrations
- **Background Tasks**: Create new scripts in the `scripts/` directory as needed


### Environment Variables
```bash
# Set in production environment
export FLASK_SECRET_KEY="your-secure-secret-key"
export OLLAMA_BASE_URL="http://ollama:11434"
export DATABASE_PATH="/app/data/nlt_customer_service.db"
```

Docker Compose also auto-loads a `.env` file from the project root. `docker-compose.windows-cloud.yml` relies on this for its two most commonly changed values:
```bash
# .env
OLLAMA_CLOUD_URL=https://<your-pod-id>-11434.proxy.runpod.net
AI_SECURITY_LEVEL=1
```
Edit `.env` and re-run `docker compose -f docker-compose.windows-cloud.yml up -d` — Compose detects the change and recreates the container automatically.

### Data Persistence
```bash
# Backup entire system
docker compose exec chatbot tar czf /tmp/nlt_backup.tar.gz \
  /app/data/nlt_customer_service.db /app/knowledge_base/

# Copy backup out of container
docker cp $(docker compose ps -q chatbot):/tmp/nlt_backup.tar.gz ./nlt_backup.tar.gz

# Restore from backup (if needed)
docker cp ./nlt_backup.tar.gz $(docker compose ps -q chatbot):/tmp/
docker compose exec chatbot tar xzf /tmp/nlt_backup.tar.gz -C /
```

## Helpful Commands

For technical support:

1. **Check system status**: `docker compose ps`
2. **Review logs**: `docker compose logs -f`
3. **Verify models**: `docker exec nlt_ollama_cpu ollama list`
4. **Database issues**: Run `python scripts/init_database.py`
5. **Hardware problems**: Use `./launch.sh` for automatic detection

