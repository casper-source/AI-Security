#!/usr/bin/env python3
"""
Ticket Monitoring Service
Automatically escalates overdue tickets and monitors SLA compliance.
"""

import requests
import time
import logging
import os
from datetime import datetime

# Configure logging
os.makedirs('/app/logs', exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/ticket_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def check_and_escalate_tickets():
    """Check for tickets that need escalation and auto-escalate them"""
    # AUTO-ESCALATION DISABLED as of September 1, 2026
    # AI-driven decisions on conversation close are now the primary escalation method
    logger.info("Auto-escalation is disabled - skipping time-based escalation check")
    return

def check_service_health():
    """Check if the main service is running"""
    try:
        response = requests.get('http://localhost:5000/api/health', timeout=10)
        if response.status_code == 200:
            logger.debug("Service health check passed")
            return True
        else:
            logger.warning(f"Service health check failed with status {response.status_code}")
            return False
    except requests.RequestException as e:
        logger.error(f"Service health check failed: {e}")
        return False

def main():
    """Main monitoring loop"""
    logger.info("Starting Ticket Monitoring Service")
    
    # Configuration
    CHECK_INTERVAL = int(os.environ.get('TICKET_MONITOR_INTERVAL', 300))  # 5 minutes default
    MAX_RETRIES = 3
    
    consecutive_failures = 0
    
    while True:
        try:
            # Check service health first
            if check_service_health():
                consecutive_failures = 0
                
                # Perform ticket escalation check
                logger.info("Running ticket escalation check...")
                check_and_escalate_tickets()
                
            else:
                consecutive_failures += 1
                logger.warning(f"Service health check failed ({consecutive_failures}/{MAX_RETRIES})")
                
                if consecutive_failures >= MAX_RETRIES:
                    logger.error("Max consecutive failures reached. Service may be down.")
                    # In production, this could trigger alerts or restart attempts
            
            # Wait for next check
            logger.debug(f"Waiting {CHECK_INTERVAL} seconds until next check...")
            time.sleep(CHECK_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("Received shutdown signal. Stopping ticket monitor...")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
            time.sleep(60)  # Wait 1 minute before retrying after error

if __name__ == "__main__":
    # Ensure log directory exists
    os.makedirs('/app/logs', exist_ok=True)
    
    # Start monitoring
    main()
