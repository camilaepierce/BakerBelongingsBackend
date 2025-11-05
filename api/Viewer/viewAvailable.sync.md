# Viewer API: viewAvailable (Sync-Orchestrated)

**Endpoint:** POST /api/Viewer/viewAvailable

**Description:** Query available inventory items with authentication and authorization via synchronized flows. This route is orchestrated by the Requesting concept and requires valid login credentials and the "viewAvailable" permission.

## Synchronization Flow

This endpoint triggers a multi-step synchronization:

1. **QueryItems_Login**: Authenticates the user via `Authorization.login`
2. **QueryItems_Authorize**: Checks if the user has the "viewAvailable" action permission via `Roles.allowAction`
3. **QueryItems_View**: If allowed, executes `Viewer.viewAvailableWrapped` to capture items in-frame
4. **QueryItems_FinalRespond**: Responds with authorization status and the items array
5. **QueryItems_RespondDenied**: If not allowed, responds with an error

## Request Body

```json
{
  "kerb": "string (username)",
  "password": "string"
}
```

### Parameters

- **kerb** (required): User's kerberos username
- **password** (required): User's password

## Success Response Body (authorized)

```json
{
  "allowed": true,
  "items": [
    {
      "_id": "...",
      "itemName": "...",
      "available": true,
      "lastKerb": "...",
      "lastCheckout": "2025-10-27T22:14:12.663Z",
      "categories": ["..."],
      "tags": ["..."]
    }
  ]
}
```

## Failure Response Body (unauthorized)

```json
{
  "allowed": false,
  "error": "User is not authorized to view available items."
}
```

## Error Response Body

```json
{
  "error": "string"
}
```

### Common Errors

- **401**: Invalid credentials (login failed)
- **403**: User does not have "viewAvailable" permission
- **504**: Request timed out (default 10s timeout)

## Requirements

- User must exist in the `userLogins` collection
- User must have the "viewAvailable" action in one of their assigned permission flags
- Valid password must be provided

## Effects

- User is authenticated (login action)
- Authorization check is performed
- Available items are queried (if authorized)
- Response is sent back to the requester

## Exclusion Note

This route is **excluded** from passthrough in `src/concepts/Requesting/passthrough.ts` and requires the full sync orchestration flow.

## Related Syncs

- `sample.QueryItems_Login`
- `sample.QueryItems_Authorize`
- `sample.QueryItems_View`
- `sample.QueryItems_FinalRespond`
- `sample.QueryItems_RespondDenied`

Located in: `src/syncs/sample.sync.ts`
