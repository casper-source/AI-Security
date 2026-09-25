mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat > /root/.ssh/authorized_keys <<'EOF'
ssh-rsa rest_of_your_ssh_public_key_here
EOF
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
unminimize -Y

# Tailscale environment variables
export TS_AUTHKEY=tskey-auth-REST_OF_YOUR_KEY_HERE
export TS_HOSTNAME=ollama-lab
