<concept>
**concept** Authorization  
**purpose** Items behind desk, and especially information about who has check out what item, should be kept hidden and available only to specific Users.  
**principle** After a user registers with a username and a password,  
    they can authenticate with that same username and password  
    and be treated each time as the same user  
  **state**  
    a set of Users with  
        a Username  
        a Password
        an Email  
        a set of PermissionFlags  
    a set of PermissionFlags with
        a set of Actions
  **actions**  
    createPermissionFlag(flag: PermissionFlag, action: Action)
      **requires** flag does not already exist
      **effects** creates a new flag with ability action
    addActionsToPermissionFlag(flag: PermissionFlag, action: Action)
      **effects** adds action to flags permissions
    removeActionsFromPermissionFlag(flag: PermissionFlag, action: Action)
      **requires** action is in flag's set of allowed actions
    promoteUser(user: User, flag: PermissionFlag)
      **requires** flag is a valid flag
      **effects** adds flag to user's set of PermissionFlags
    DemoteUser(user: User, flag: PermissionFlag)
      **requires** flag is a valid flag
      **effects** removes flag from user's set of flags
    allowAction(user: User, action: Action): Boolean
      **requires** user is a valid User and action is a valid Action
      **effects** returns True if user can complete this action; False otherwise
</concept>