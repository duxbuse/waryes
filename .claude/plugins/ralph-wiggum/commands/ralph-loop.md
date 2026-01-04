---
description: "Start Ralph Wiggum loop in current session"
argument-hint: "PROMPT [--max-iterations N] [--completion-promise TEXT]"
allowed-tools: ["Write"]
hide-from-slash-command-tool: "true"
---

# Ralph Loop Command

Parse the arguments from `$ARGUMENTS`:
- Everything not starting with `--` is the PROMPT
- `--max-iterations N` sets max iterations (default: 10, use 0 for unlimited)
- `--completion-promise "TEXT"` sets completion promise (default: null)

Create the state file at path `.claude/ralph-loop.local.md` (relative to project root) with this content:

```
---
active: true
iteration: 1
max_iterations: [MAX_ITERATIONS, default 10]
completion_promise: [PROMISE in quotes, or null]
started_at: "[current ISO timestamp]"
---

[THE PROMPT TEXT]
```

After creating the file, output:

```
========================================
        RALPH LOOP STARTED
========================================
  Iteration:  1/[MAX] or 1 (unlimited)
  Promise:    "[PROMISE]" or none
========================================

Task: [PROMPT]

To complete: output <promise>[PROMISE]</promise>
(ONLY when the statement is TRUE - do not lie!)
```

Then work on the task. When you try to exit, the Ralph loop will feed the SAME PROMPT back to you for the next iteration.

CRITICAL RULE: If a completion promise is set, you may ONLY output it when the statement is completely and unequivocally TRUE. Do not output false promises to escape the loop.
