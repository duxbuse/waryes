---
description: "Cancel active Ralph Wiggum loop"
allowed-tools: ["Bash", "Read"]
hide-from-slash-command-tool: "true"
---

# Cancel Ralph

Check if the file `.claude/ralph-loop.local.md` exists:
- If it exists, read it to get the current iteration, then delete the file
- If it doesn't exist, say "No active Ralph loop found."

Report: "Cancelled Ralph loop (was at iteration N)" where N is the iteration from the file.
