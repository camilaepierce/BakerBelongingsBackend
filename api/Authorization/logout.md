# Authorization API: logout

Endpoint: POST /api/Authorization/logout

Description: Invalidates a user's current token. Provide kerb and token when possible; if kerb is omitted, a token-only lookup is attempted.

Request Body:
{
  "kerb": "string (optional)",
  "token": "string (optional)"
}

Response 200:
{
  "success": true,
  "invalidated": true | false
}

Notes:
- If no matching record is found or token mismatches, `invalidated` will be false.
- This endpoint does not error on missing or mismatched tokens to avoid account enumeration.
