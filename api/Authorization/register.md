# Authorization API: register

Endpoint: POST /api/Authorization/register

Description: Register a new user for login. Stores credentials in the `userLogins` collection.

Request Body:
{
  "kerb": "string (alphanumeric)",
  "email": "string (must match kerb prefix)",
  "first": "string",
  "last": "string",
  "password": "string (min 6 chars)",
  "role": "string (optional, permission flag name)"
}

Response 200:
{
  "kerb": "string",
  "email": "string",
  "first": "string",
  "last": "string",
  "created": true
}

Notes:
- kerb must equal the part of the email before '@'.
- Password is salted and hashed (SHA-256) and never returned.
- If a role is provided, the user is automatically promoted to that permission flag after registration.
- Role promotion is attempted but registration succeeds regardless of whether the role exists or promotion fails.
