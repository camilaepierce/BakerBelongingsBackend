---
timestamp: 'Wed Oct 15 2025 15:12:59 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_151259.24e73a75.md]]'
content_id: c739cb96545626650ea4094da9dd3f120ca03a845c0c199b9bca7819a48074e0
---

# concept: Roles

1. Roles
   **concept** Roles\
   **purpose** maintain security of what actions different types of users can perform\
   **principle** A User can be a part of a specific role that can perform a given set of actions. Users can be promoted and demoted depending on need.\
   **state**\
   a set of Roles with\
   a Permission Flag\
   a set of Users\
   a set of Permission Flags with\
   a set of Actions\
   **actions**\
   promteUser (user: User, permission; Permission Flag)\
   **requires** user is a valid User, permission is a valid Permission Flag\
   **effects** adds user to Role containing given Permission Flag\
   demoteUser (user: User, permission; Permission Flag)\
   **requires** user is a valid User, permission is a valid Permission Flag, user is within the role permission refers to\
   **effects** removes user from Role containing given Permission Flag\
   allowAction (user: User, action: Action): Boolean\
   **requires** user is a valid User, action is a valid Action\
   **effects** returns True if action is an action corresponding to the user's permission flags
