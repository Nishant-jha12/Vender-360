# Vendor360 Security Architecture

## 🛡 Authentication & Secrets
- **Password Hashing**: PBKDF2-HMAC-SHA256 with 260,000 iterations and distinct salts.
- **Session Tokens**: HS256 JWT with strict expiration and revokable session tracking.
- **Rate Limiting**: IP and account lockout after repeated failed attempts.
- **Audit Log**: Persistent log of security events (logins, password resets, active sessions).
