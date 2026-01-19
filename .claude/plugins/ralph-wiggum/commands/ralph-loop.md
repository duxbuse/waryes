---
description: "Start Ralph Wiggum loop in current session"
argument-hint: "PROMPT [--max-iterations N] [--completion-promise TEXT]"
allowed-tools: ["Bash"]
hide-from-slash-command-tool: "true"
---

# Ralph Loop Command

Run the setup script to create the state file with accurate timestamps:

```bash
node ".claude/plugins/ralph-wiggum/scripts/setup-ralph-loop.js" $ARGUMENTS
```

The setup script will:
1. Parse the arguments (prompt, --max-iterations, --completion-promise)
2. Create the state file with an accurate Unix timestamp
3. Display the startup banner and instructions

After the script runs successfully, immediately begin working on the task described in the prompt.

When you try to exit/complete, the Ralph loop stop hook will:
- Check if you output `<promise>COMPLETION_TEXT</promise>`
- If found AND no contradictions detected, the loop ends
- Otherwise, it feeds the same prompt back for the next iteration

CRITICAL RULES:
1. If a completion promise is set, you may ONLY output it when the statement is completely and unequivocally TRUE
2. Do not output false promises to escape the loop
3. If you say things like "features remain to be implemented" or "not yet complete", the promise will be REJECTED even if you output it
