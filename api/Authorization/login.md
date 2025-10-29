# Authorization API: login

Endpoint: POST /api/Authorization/login

Description: Authenticate a user by kerb or email and password. If successful, returns a short-lived token and updates last login time.

Request Body:
{
  "kerb": "string (optional)",
  "email": "string (optional)",
  "password": "string"
}

Response 200:
{
  "success": true,
  "kerb": "string",
  "token": "string",
  "userId": "string (optional)"
}

Notes:
- Provide either kerb or email. If email is provided, kerb is derived from the email prefix.
- Token is a hash-based opaque string, stored in the login record (not a JWT).
- userId is included when available (e.g., when a corresponding user profile exists); if missing, call whoami.
