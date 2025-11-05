# Reservation API: checkoutItem (Sync-Orchestrated)

**Endpoint:** POST /api/Reservation/checkoutItem

**Description:** Check out an inventory item with authentication and authorization via synchronized flows. This route is orchestrated by the Requesting concept and requires valid login credentials and the "checkoutItem" permission.

## Synchronization Flow

This endpoint triggers a multi-step synchronization:

1. **CheckoutItem_Login**: Authenticates the user via `Authorization.login`
2. **CheckoutItem_Authorize**: Checks if the user has the "checkoutItem" action permission via `Roles.allowAction`
3. **CheckoutItem_ExecuteAndRespond**: If allowed, executes `Reservation.checkoutItem` and responds with success status

## Request Body

```json
{
  "kerb": "string (username)",
  "password": "string",
  "itemName": "string"
}
```

### Parameters

- **kerb** (required): User's kerberos username
- **password** (required): User's password
- **itemName** (required): Name of the item to check out

## Success Response Body

```json
{
  "success": true
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
- **403**: User does not have "checkoutItem" permission
- **404**: Item not found or user not found
- **409**: Item already checked out
- **400**: Invalid quantity or missing required fields
- **504**: Request timed out (default 10s timeout)

## Requirements

- User must exist in the `userLogins` collection
- User must have the "checkoutItem" action in one of their assigned permission flags
- Valid password must be provided
- Item must exist in the inventory
- Item must be available (not currently checked out)
- User must have appropriate role (e.g., "resident")

## Effects

- User is authenticated (login action)
- Authorization check is performed
- Item availability is decremented
- Item's `lastCheckout` date is updated to current timestamp
- Item's `lastKerb` is set to the user's kerb
- Response is sent back to the requester

## Exclusion Note

This route is **excluded** from passthrough in `src/concepts/Requesting/passthrough.ts` and requires the full sync orchestration flow to ensure proper authentication and authorization.

## Related Syncs

- `sample.CheckoutItem_Login`
- `sample.CheckoutItem_Authorize`
- `sample.CheckoutItem_ExecuteAndRespond`

Located in: `src/syncs/sample.sync.ts`

## Notes

- The checkout operation updates the MongoDB `items` collection
- Items track their availability state, last checkout date, and last user
- The sync flow ensures atomic execution: authentication → authorization → checkout
- Only users with the "checkoutItem" permission can successfully complete this flow
