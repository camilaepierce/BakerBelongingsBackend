# Design Changes to the Application as a Whole

# Interesting Moments
1. On successive calls to Gemini, it would occasionally build a temporary file based on copying the provided database files, and other times it would create a temp file by assigning content in the beginning of the file and loading from there on each run of the testing script.
*   [Creating Temp Files](context/design/brainstorming/questioning.md/steps/response.dcf8f3aa.md)
*   [Hardcoded content](context/design/brainstorming/questioning.md/steps/prompt.a5d7229d.md)
2. Gemini repeatedly attempted to use Deno.context functionality within Deno test cases. This would likely work outside of the suite, but the implementation procured by Gemini was error-prone in this way several times. It took quite a bit of prompt-engineering to build a test suite without those specific lines. Handful of prompts that used this:
*   [First](context/design/brainstorming/questioning.md/steps/response.ba6fe5b5.md)
*   [Second](context/design/brainstorming/questioning.md/steps/response.5156b06f.md)
*   [Third](context/design/brainstorming/questioning.md/steps/response.6b8db14d.md)
3. Generally, as the amount of code Gemini was looking at got larger, its performance got worse. It became more difficult to guide the model into creating specific styles of tests.
*   [Before large code base](context/design/brainstorming/questioning.md/steps/response.f6de9e95.md)
*   [After Large code base built](context/design/brainstorming/questioning.md/steps/prompt.9d1ce950.md)
4. Gemini hallucinating errors from the error file that it designed. Although the file was in the context section of the brainstorming/prompt document, Gemini repeated chose new names for errors that had already been assigned meanings.
*   [UserNotFoundError previously nonexistent](context/design/brainstorming/questioning.md/steps/prompt.600ddf68.md)
5. assertTrue was a completely made up function from jsr:@std/assert", even though the basic 'assert' offered precisely the functionality the LLM was likely looking for. Furthermore, the arguments that were being attempted to pass into assertTrue were themselves causing syntax errors.
*   [assertTrue](context/design/brainstorming/questioning.md/steps/response.dcf8f3aa.md)

# Design Changes, Cont.
1. Generally, the font and color scheme were updated to better match the intended atmosphere of the application. 
2. Updated in the frontend repository, different views and components were hidden depending on the restrictions of the user. Previously, all of the pages were available in the navigation bar, but now those pages are only visible if the permissions are high enough. For example, someone who works desk can see the management page, and a houseteam member can see the permissions page.
3. The search type options are decreased, to better improve the user's flow and recommended actions. The autocomplete capability has been morphed to be included with searching for the item name, as opposed to requiring a precise hit in the database.
4. Full log-in/log-out functionality has been implemented, with the Authorization concept syncing with the Role concept to allow for access to certain actions.

# Design Changes, Final Submission
1. Modified functions within Roles to pass strings instead of user Objects or ids. This allows for the user to be searched up in the MongoDB database separately, increasing the funcitonality of this action. Additionally, this simpler arrangement is much easier to debug and prevents representation independence.
2. Updated visual design of Permissions page. It now has the ability to promote / demote users to different roles, and revert changes made before saving during the editing of roles. The changes are also helpfully updated in the right-hand side of the view, as to create a better visual for events.
3. Added a inventory management concept to design, to also allow for desk and houseteam to add or remove items from the inventory
4. Removed the syncs that authenticated by passing the user's kerb and password on every action, namely the promoting / demoting users and authenticating that the requesting user has the perimssions to do so. Passing the user's password between the frontend and backend on every action is less secure than should be required, so the authentication is held separately.
5. Updated error messages. Error messages are now easier to understand, and unless something is going wrong with the server, will only display human-readable error messages.