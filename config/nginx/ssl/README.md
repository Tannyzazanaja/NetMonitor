# Enterprise SSL/TLS Certificates Directory

Place your corporate or internal CA certificates in this directory to enable HTTPS on Port 443:

- `cert.pem`: SSL/TLS Certificate chain (Fullchain, including Intermediate CA)
- `key.pem`: Private Key (unencrypted RSA or ECDSA key)

## How to enable HTTPS in Nginx:
1. Copy your valid certificate and private key files here:
   - `config/nginx/ssl/cert.pem`
   - `config/nginx/ssl/key.pem`
2. In `config/nginx/netmonitor.conf`, uncomment the HTTPS server block (Port 443).
3. In `docker-compose.yml`, ensure port `443:443` is exposed on the `nginx` container.
4. Restart Nginx: `docker compose restart nginx`

## How to generate a temporary Self-Signed Certificate for testing:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout config/nginx/ssl/key.pem \
  -out config/nginx/ssl/cert.pem \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=Enterprise/CN=netmonitor.local"
```
