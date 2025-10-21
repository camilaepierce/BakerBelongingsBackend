---
timestamp: 'Mon Oct 20 2025 16:32:45 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251020_163245.8a26a214.md]]'
content_id: 8fa15e9e6edd56ce112a30224d974f49d3c92afd12d35d86a602de8510f0b649
---

# API Specification: Roles Concept

**Purpose:** maintain security of what actions different types of users can perform

***

## API Endpoints

### POST /api/Roles/promoteUser

**Description:** adds user to Role containing given Permission Flag

**Requirements:**

* user is a valid User, permission is a valid Permission Flag

**Effects:**

* adds user to Role containing given Permission Flag

**Request Body:**

```json
{
  "user": "string",
  "permission": "string"
}
```

**Success Response Body (Action):**

```json
{}
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Roles/demoteUser

**Description:** removes user from Role containing given Permission Flag

**Requirements:**

* user is a valid User, permission is a valid Permission Flag, user is within the role permission refers to

**Effects:**

* removes user from Role containing given Permission Flag

**Request Body:**

```json
{
  "user": "string",
  "permission": "string"
}
```

**Success Response Body (Action):**

```json
{}
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Roles/allowAction

**Description:** returns True if action is an action corresponding to the user's permission flags

**Requirements:**

* user is a valid User, action is a valid Action

**Effects:**

* returns True if action is an action corresponding to the user's permission flags

**Request Body:**

```json
{
  "user": "string",
  "action": "string"
}
```

**Success Response Body (Action):**

```json
{
  "allowed": "boolean"
}
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Roles/\_getUserPermissions

**Description:** returns the set of all PermissionFlags associated with the user.

**Requirements:**

* user exists (optional, returns empty array if not found)

**Effects:**

* returns the set of all PermissionFlags associated with the user.

**Request Body:**

```json
{
  "user": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "permissionFlags": "string[]"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Roles/\_getPermissionFlagActions

**Description:** returns the set of all Actions associated with the given PermissionFlag.

**Requirements:**

* permission exists

**Effects:**

* returns the set of all Actions associated with the given PermissionFlag.

**Request Body:**

```json
{
  "permission": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "actions": "string[]"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Roles/\_listAllPermissionFlags

**Description:** returns a list of all defined Permission Flags with their details.

**Requirements:**

* true

**Effects:**

* returns a list of all defined Permission Flags with their details.

**Request Body:**

```json
{}
```

**Success Response Body (Query):**

```json
[
  {
    "id": "string",
    "name": "string",
    "actions": "string[]"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```
