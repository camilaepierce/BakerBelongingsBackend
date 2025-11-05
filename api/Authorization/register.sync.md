# Authorization API: register (Sync-Orchestrated)

**Endpoint:** POST /api/Authorization/register

**Description:** Register a new user and automatically promote them to a specified permission flag. This route is orchestrated by the Requesting concept to combine user registration with role assignment in a single synchronized flow.

## Synchronization Flow

This endpoint triggers a multi-step synchronization:

1. **UpdateRoles_Register**: Creates a new user account via `Authorization.register` with the optional role parameter
2. **UpdateRoles_PromoteAndRespond**: Promotes the user to the specified permission flag via `Roles.promoteUser` and responds with confirmation

## Request Body

```json
{
  "kerb": "string (alphanumeric)",
  "email": "string (must match kerb@domain)",
  "first": "string",
  "last": "string",
  "password": "string (min 6 chars)",
  "permission": "string (permission flag ID)"
}
```

### Parameters

- **kerb** (required): User's kerberos username (alphanumeric only)
- **email** (required): User's email address (prefix must match kerb)
- **first** (required): User's first name
- **last** (required): User's last name
- **password** (required): Password (minimum 6 characters)
- **permission** (required for sync flow): Permission flag ID to assign to the new user

## Success Response Body

```json
{
  "promoted": true
}
```

## Error Response Body

```json
{
  "error": "string"
}
```

### Common Errors

- **400**: Invalid input (e.g., non-alphanumeric kerb, email doesn't match kerb, password too short)
- **409**: User with this kerb already exists
- **404**: Specified permission flag doesn't exist
- **504**: Request timed out (default 10s timeout)

## Requirements

- `kerb` must be alphanumeric
- `email` must contain '@' and the prefix must match `kerb`
- `password` must be at least 6 characters
- `first` and `last` names must be provided
- `permission` flag must exist in the `Roles.permissionFlags` collection

## Effects

- Creates a new user in the `userLogins` collection with salted/hashed password
- Creates or updates a corresponding entry in the `users` collection
- Adds the specified permission flag to the user's roles in `Roles.userRoles`
- Returns promotion confirmation

## Exclusion Note

This route is **excluded** from passthrough in `src/concepts/Requesting/passthrough.ts` to ensure the full registration + promotion synchronization flow executes atomically.

## Related Syncs

- `sample.UpdateRoles_Register`
- `sample.UpdateRoles_PromoteAndRespond`

Located in: `src/syncs/sample.sync.ts`

## Notes

- Password is salted and hashed (SHA-256) before storage
- The user profile is created in both `userLogins` and `users` collections
- If the permission flag doesn't exist, the registration still succeeds but promotion fails (the sync returns an error response)
- Role promotion uses `$addToSet` to prevent duplicate permission assignments
