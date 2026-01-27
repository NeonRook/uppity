# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, report vulnerabilities via one of these methods:

1. **GitHub Security Advisories** (preferred): Use [GitHub's private vulnerability reporting](https://github.com/NeonRook/uppity/security/advisories/new)

2. **Email**: Send details to `security@neonrook.com`

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity, typically 30-90 days

### Disclosure Policy

- We will acknowledge receipt of your report
- We will investigate and keep you informed of progress
- We will credit reporters in security advisories (unless you prefer anonymity)
- We ask that you do not publicly disclose the issue until we've had a chance to address it

## Security Best Practices for Deployment

When self-hosting Uppity, follow these security recommendations:

### Environment Variables

- Never commit `.env` files to version control
- Use strong, unique values for `BETTER_AUTH_SECRET` (minimum 32 characters)
- Rotate secrets periodically

### Network Security

- Always use HTTPS in production
- Configure `BETTER_AUTH_TRUSTED_ORIGINS` properly
- Use a reverse proxy (nginx, Caddy) with proper headers

### Database Security

- Use strong database credentials
- Restrict database network access
- Enable SSL for database connections in production

### Updates

- Keep Uppity updated to the latest version
- Monitor security advisories
- Update dependencies regularly

## Known Security Considerations

- **Authentication**: Uppity uses better-auth for authentication. Ensure your deployment follows their security guidelines.
- **Status Pages**: Public status pages are accessible without authentication by design. Be mindful of what information you expose.
- **Webhooks**: Webhook URLs should be kept confidential. Uppity signs webhook payloads for verification.
