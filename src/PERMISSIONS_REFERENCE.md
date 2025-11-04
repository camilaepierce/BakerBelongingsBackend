# Permissions Reference

This document lists all permission flags and actions for the BakerBelongings RBAC system.

## Permission Flags

The system uses a three-tier permission structure:

| Flag Name  | Flag ID    | Level | Description                                                    |
| ---------- | ---------- | ----- | -------------------------------------------------------------- |
| Resident   | Resident   | 1     | Basic level - can only view the inventory                      |
| Desk       | Desk       | 2     | Desk staff - can view and manage inventory, check items in/out |
| Houseteam  | Houseteam  | 3     | Full admin - all permissions including user management         |

**Source Files:**

- Flags are auto-seeded on server startup in: `src/concepts/Roles/RolesConcept.ts` (ensureReferenceFlagsAndActions)
- Flags are fetched from: `POST /api/Roles/_listAllPermissionFlags`
- Users are assigned flags via: `src/dev/seedUsers.ts` (dev seeding) or `POST /api/Roles/promoteUser` (accepts either `user` ID or `kerb`)

## Actions

Actions are the granular permissions that control what users can do.

| Action ID              | Granted To           | Purpose                                         |
| ---------------------- | -------------------- | ----------------------------------------------- |
| `inventory.view`       | All users            | Can view the inventory page                     |
| `management.view`      | Desk, Houseteam      | Can view the management page                    |
| `permissions.view`     | Houseteam only       | Can view the permissions/admin page             |
| `permissions.manage`   | Houseteam only       | Can modify user permissions (promote/demote)    |
| `reservation.checkout` | Desk, Houseteam      | Can checkout items to users                     |
| `reservation.checkin`  | Desk, Houseteam      | Can check items back in                         |

## Permission Hierarchy

```
Resident (Level 1)
└─ inventory.view

Desk (Level 2)
├─ inventory.view
├─ management.view
├─ reservation.checkout
└─ reservation.checkin

Houseteam (Level 3)
├─ inventory.view
├─ management.view
├─ permissions.view
├─ permissions.manage
├─ reservation.checkout
└─ reservation.checkin
```
