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