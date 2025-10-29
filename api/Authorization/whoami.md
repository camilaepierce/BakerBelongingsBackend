# Authorization API: whoami

Endpoint: POST /api/Authorization/whoami

Description: Returns the current authenticated identity and role-based permissions derived from the provided token (and/or kerb).

Request Body:
{
  "kerb": "string (optional)",
  "token": "string (optional)"
}

Response 200 (when valid):
{
  "userId": "string",
  "kerb": "string",
  "flags": ["string"],
  "actions": ["string"]
}

Response 200 (when invalid):
{
  "error": "Invalid token"
}

Notes:
- Provide a token. If kerb is omitted, it is derived from the token.
- flags are Permission Flag IDs associated with the user.
- actions is the union of all actions granted by the user's permission flags.
