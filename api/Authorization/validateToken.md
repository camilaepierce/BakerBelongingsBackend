# Authorization API: validateToken

Endpoint: POST /api/Authorization/validateToken

Description: Validates whether a token is currently active. Token is considered valid if it matches the stored `lastToken` and is not older than 24 hours.

Request Body:
{
  "kerb": "string (optional)",
  "token": "string (optional)"
}

Response 200:
{
  "valid": true | false,
  "kerb": "string (present when valid)"
}

Notes:
- Provide either kerb or token (or both). If kerb is missing, the lookup is performed by token.
- Token TTL is 24 hours from `lastTokenAt`.
