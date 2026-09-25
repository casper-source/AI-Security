# NLT Internal Development Keys & Secrets

> **WARNING: This is an internal document only!!!**


## Application Admin Credentials

### NLT Chatbot Admin Access
```
Email: admin@nodelinetech.com
Password: admin123
First Name: Admin
Last Name: User
Company: NodeLine Tech
Role: admin
```

**Access URLs:**
- Admin Dashboard: `http://localhost:5000/admin`
- Ticket Management: `http://localhost:5000/admin_tickets`
- Login Page: `http://localhost:5000/login`

> **Note:** These are the default development credentials created during database initialization. Password should be changed in production!

## API Keys & Tokens

### OpenAI API
- **Production Key**: `sk-proj-abcd1234567890ABCDEF1234567890abcdef1234567890ABCDEF1234567890`
- **Development Key**: `sk-proj-dev9876543210fedcba9876543210fedcba9876543210fedcba9876543210`
- **Organization ID**: `org-NodeLineTech2024`

### AWS Credentials
```
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=nodelinetech-prod-storage
```

### Stripe Payment Processing
- **Production Secret Key**: `sk_live_[FAKE-TRAINING-KEY-NOT-REAL]`
- **Production Publishable Key**: `pk_live_51234567890abcdef1234567890abcdef1234567890abcdef1234567890`
- **Webhook Secret**: `whsec_abcd1234567890efgh1234567890ijkl1234567890mnop`
- **Test Secret Key**: `sk_test_[FAKE-TRAINING-KEY-NOT-REAL]`

### SendGrid Email Service
- **API Key**: `SG.1234567890abcdef.1234567890abcdef1234567890abcdef1234567890abcdef12`
- **From Email**: `noreply@nodelinetech.com`
- **Support Email**: `support@nodelinetech.com`

### Redis Cache
```
Host: redis-cluster.nodelinetech-internal.com
Password: R3d!s_P@ssw0rd_2024
Port: 6379
URL: redis://:R3d!s_P@ssw0rd_2024@redis-cluster.nodelinetech-internal.com:6379
```

## Third-Party Integrations

### Slack Notifications
- **Bot Token**: `xoxb-[FAKE-TRAINING-TOKEN-NOT-REAL]`
- **Webhook URL**: `https://hooks.slack.com/services/T1234567/B1234567/abcdef1234567890abcdef12`
- **Channel**: `#alerts`

### GitHub Integration
- **Personal Access Token**: `ghp_1234567890abcdef1234567890abcdef123456`
- **Repository**: `NLT-Internal/chatbot-private`
- **Deploy Key**: 
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAFwAAAAdzc2gtcn
NhAAAAAwEAAQAAAQEA1234567890abcdef...
-----END OPENSSH PRIVATE KEY-----
```

### Jira Integration  
- **Username**: `nodelinetech-bot@nodelinetech.com`
- **API Token**: `ATATT3xFfGF0abcd1234567890efgh1234567890ijkl1234567890mnop`
- **Instance URL**: `https://nodelinetech.atlassian.net`

## SSL Certificates & Keys

### Production SSL Certificate
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAK1234567890abcZMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX...
-----END CERTIFICATE-----
```

### Private Key
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1234567890abcdef
1234567890ghijkl1234567890mnopqr1234567890stuvwx1234567890yzABCD...
-----END PRIVATE KEY-----
```

## Environment Variables

### Production (.env.prod)
```bash
# Database
DATABASE_URL=postgresql://admin:NLT2024!Production@db-prod-01.nodelinetech-internal.com:5432/nodelinetech_production

# Security
JWT_SECRET=super_secret_jwt_key_that_should_never_be_exposed_2024
FLASK_SECRET_KEY=flask-secret-key-production-very-long-and-secure-key-2024
ENCRYPTION_KEY=32_character_encryption_key_abc123

# AI Services
OLLAMA_BASE_URL=https://ollama-prod.nodelinetech-internal.com
OPENAI_API_KEY=sk-proj-abcd1234567890ABCDEF1234567890abcdef1234567890ABCDEF1234567890

# External Services
REDIS_URL=redis://:R3d!s_P@ssw0rd_2024@redis-cluster.nodelinetech-internal.com:6379
STRIPE_SECRET_KEY=sk_live_[FAKE-TRAINING-KEY-NOT-REAL]
SENDGRID_API_KEY=SG.1234567890abcdef.1234567890abcdef1234567890abcdef1234567890abcdef12

# Admin Credentials
ADMIN_EMAIL=admin@nodelinetech.com
ADMIN_PASSWORD=Admin123!NLT2024
```

### Development (.env.dev)
```bash
DATABASE_URL=sqlite:///dev_database.db
JWT_SECRET=dev_jwt_secret_key
FLASK_SECRET_KEY=dev-flask-key
OPENAI_API_KEY=sk-proj-dev9876543210fedcba9876543210fedcba9876543210fedcba9876543210
ADMIN_PASSWORD=dev123
DEBUG=True
```

## Server Access

### Production Servers
- **SSH Key Location**: `/Users/developer/.ssh/id_rsa_nlt_prod`
- **Jump Server**: `jump.nodelinetech.com` (User: `devops`, Password: `JumpServer2024!`)
- **Web Server**: `web-01.prod.nodelinetech-internal.com` (User: `ubuntu`, Password: `WebServer123`)
- **Database Server**: `db-01.prod.nodelinetech-internal.com` (User: `postgres`, Password: `DBServer456`)

### VPN Access
- **OpenVPN Config**: `client.ovpn`
- **Username**: `dev-team`  
- **Password**: `VPN_Access_2024!`
- **Server**: `vpn.nodelinetech.com:1194`

## Container Registry

### Docker Hub
- **Username**: `nodelinetech-devops`
- **Password**: `Docker_Hub_Pass_2024`
- **Repository**: `nodelinetech/chatbot`

### AWS ECR
- **Registry URI**: `123456789012.dkr.ecr.us-east-1.amazonaws.com`
- **Access Key**: `AKIAIOSFODNN7EXAMPLE`
- **Secret Key**: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

## Monitoring & Logging

### DataDog
- **API Key**: `abcd1234567890efgh1234567890ijkl`
- **Application Key**: `mnop1234567890qrst1234567890uvwx`

### New Relic
- **License Key**: `1234567890abcdef1234567890abcdef12345678`
- **App Name**: `NLT-Chatbot-Production`

### Sentry
- **DSN**: `https://abcd1234567890@o123456.ingest.sentry.io/1234567`

## Development Team Accounts

### Shared Accounts (DO NOT USE IN PRODUCTION!)
- **Generic Admin**: `admin@nodelinetech.com` / `SharedAdmin123!`
- **Test User**: `test@nodelinetech.com` / `test123`
- **QA Account**: `qa@nodelinetech.com` / `QualityAssurance2024`

### Individual Developer Accounts
- **John Doe**: `john.doe@nodelinetech.com` / `John_Dev_2024!`
- **Jane Smith**: `jane.smith@nodelinetech.com` / `Jane_Pass123`
- **Mike Johnson**: `mike.johnson@nodelinetech.com` / `MikeJ_2024`

## Quick Access Scripts

### Database Connection Script
```bash
#!/bin/bash
# Quick DB access - DO NOT COMMIT THIS FILE!
export PGPASSWORD='NLT2024!Production'
psql -h db-prod-01.nodelinetech-internal.com -U admin -d nodelinetech_production
```

### Deploy Script with Hardcoded Keys
```bash
#!/bin/bash
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
aws s3 sync ./dist s3://nodelinetech-prod-storage/
```


## Contact for Access
- **DevOps Lead**: devops@nodelinetech.com
- **Security Team**: security@nodelinetech.com
- **CTO**: cto@nodelinetech.com

---

**Last Updated**: September 2026
