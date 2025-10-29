# Permission System Restructuring - Summary

## Overview

The BakerBelongings RBAC system has been restructured from a 9-flag system to a clean **three-tier permission hierarchy**.

## New Permission Structure

### 1. Resident (Basic Access)
**Flag ID:** `Resident`

**Actions:**
- `inventory.view` - Can view the inventory page

**Description:** Basic level access for residents who only need to browse the available items.

### 2. Desk (Staff Access)
**Flag ID:** `Desk`

**Actions:**
- `inventory.view` - Can view the inventory page
- `management.view` - Can view the management page
- `reservation.checkout` - Can checkout items to users
- `reservation.checkin` - Can check items back in

**Description:** Desk staff level with ability to view inventory and management pages, and manage item reservations.

### 3. Houseteam (Full Administrative Access)
**Flag ID:** `Houseteam`

**Actions:**
- `inventory.view` - Can view the inventory page
- `management.view` - Can view the management page
- `permissions.view` - Can view the permissions/admin page
- `permissions.manage` - Can modify user permissions
- `reservation.checkout` - Can checkout items to users
- `reservation.checkin` - Can check items back in

**Description:** Full administrative access including all viewing and management capabilities, plus the ability to manage user permissions.

## Changes Made

### Backend Changes

1. **src/concepts/Roles/RolesConcept.ts**
   - Updated `ensureReferenceFlagsAndActions()` to create only 3 flags instead of 9
   - New flags: Resident, Desk, Houseteam
   - Removed: Admin, DeskStaff, Editor, Viewer, Perm1, Perm2, ComplexPerm, Alpha, Beta

2. **src/dev/seedUsers.ts**
   - Updated role mapping:
     - `resident` CSV role → `Resident` flag
     - `desk` CSV role → `Desk` flag
     - `houseteam` CSV role → `Houseteam` flag

3. **src/PERMISSIONS_REFERENCE.md**
   - Complete rewrite documenting the new three-tier system
   - Clear permission hierarchy visualization
   - Updated action descriptions

4. **api/RBAC_INTEGRATION.md**
   - Updated all examples to use new flag names
   - Updated action lists throughout
   - Revised dev test users section
   - Updated action naming convention documentation

## Migration Notes

### For Frontend Developers

**Old Action → New Action Mapping:**
- `inventory.manage` → `management.view` (for accessing management page)
- `roles.manage` → `permissions.manage` (for managing user permissions)
- `reservation.checkout` → unchanged
- `reservation.checkin` → unchanged

**New Actions:**
- `inventory.view` - Required for all users to see inventory
- `management.view` - Required to access management page
- `permissions.view` - Required to see permissions page

**Frontend Route Guards Should Check:**
- Inventory page: `inventory.view` (all users)
- Management page: `management.view` (Desk and Houseteam)
- Permissions/Admin page: `permissions.view` AND `permissions.manage` (Houseteam only)

### For Testing

**Test Users (all have password: `testpassword123`):**

**Resident users:**
- `camjohnson`, `alewilson`, `benlee`, `miawang`, `lucgarrison`, `maxbrown`, `evaadams`, `liamnguyen`, `olinorris`, `isacole`, `harpatel`, `gilramsey`

**Desk users:**
- `samdoer`, `campierce`, `noahkim`, `emmbishop`, `zacgray`

**Houseteam users (admins):**
- `zoeclark`, `sopjay`, `roxlee`

## API Examples

### Get All Flags
```bash
curl -X POST http://localhost:8000/api/Roles/_listAllPermissionFlags \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
[
  {
    "id": "Resident",
    "name": "Resident",
    "actions": ["inventory.view"]
  },
  {
    "id": "Desk",
    "name": "Desk",
    "actions": ["inventory.view", "management.view", "reservation.checkout", "reservation.checkin"]
  },
  {
    "id": "Houseteam",
    "name": "Houseteam",
    "actions": ["inventory.view", "management.view", "permissions.view", "permissions.manage", "reservation.checkout", "reservation.checkin"]
  }
]
```

### Test User Login
```bash
# Login as a Houseteam member (full access)
curl -X POST http://localhost:8000/api/Authorization/login \
  -H "Content-Type: application/json" \
  -d '{"kerb": "zoeclark", "password": "testpassword123"}'
```

### Get User Permissions
```bash
# Use whoami to get complete RBAC data
curl -X POST http://localhost:8000/api/Authorization/whoami \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN_HERE"}'
```

**Expected Response (for zoeclark):**
```json
{
  "userId": "user_zoeclark_...",
  "kerb": "zoeclark",
  "flags": ["Houseteam"],
  "actions": [
    "inventory.view",
    "management.view",
    "permissions.view",
    "permissions.manage",
    "reservation.checkout",
    "reservation.checkin"
  ]
}
```

## Verification

✅ Server starts and seeds 20 users with new flags
✅ All Authorization tests passing (14 steps)
✅ Endpoints registered correctly
✅ Documentation updated comprehensively

## Next Steps for Frontend

1. Update route guards to check for new action names:
   - Replace `inventory.manage` checks with `management.view`
   - Replace `roles.manage` checks with `permissions.manage`
   - Add `inventory.view` check for base inventory access

2. Update component-level permission checks to use new actions

3. Update RBAC store initialization to work with new flag structure

4. Test with the provided test users to verify each permission level
