#!/usr/bin/env node
// Ralph Loop Setup Script (Node.js)
// Creates state file for in-session Ralph loop

const fs = require('fs');
const path = require('path');

const RALPH_STATE_FILE = '.claude/ralph-loop.local.md';

function showHelp() {
    console.log(`
Ralph Loop - Interactive self-referential development loop

USAGE:
  /ralph-loop [PROMPT...] [OPTIONS]

ARGUMENTS:
  PROMPT...    Initial prompt to start the loop

OPTIONS:
  --max-iterations <n>           Maximum iterations before auto-stop (default: 10, 0 = unlimited)
  --completion-promise '<text>'  Promise phrase to signal completion
  -h, --help                     Show this help message

DESCRIPTION:
  Starts a Ralph Wiggum loop in your CURRENT session. The stop hook prevents
  exit and feeds your output back as input until completion or iteration limit.

  To signal completion, output: <promise>YOUR_PHRASE</promise>

EXAMPLES:
  /ralph-loop Build a todo API --completion-promise 'DONE' --max-iterations 20
  /ralph-loop --max-iterations 10 Fix the auth bug
  /ralph-loop Refactor cache layer  (runs forever)

STOPPING:
  Only by reaching --max-iterations or detecting --completion-promise
`);
}

function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    const promptParts = [];
    let maxIterations = 10;  // Default to 10 for safety
    let completionPromise = 'null';

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === '-h' || arg === '--help') {
            showHelp();
            process.exit(0);
        } else if (arg === '--max-iterations') {
            i++;
            if (i >= args.length || !args[i]) {
                console.error('Error: --max-iterations requires a number argument');
                process.exit(1);
            }
            const val = parseInt(args[i], 10);
            if (isNaN(val) || val < 0) {
                console.error(`Error: --max-iterations must be a non-negative integer, got: ${args[i]}`);
                process.exit(1);
            }
            maxIterations = val;
        } else if (arg === '--completion-promise') {
            i++;
            if (i >= args.length || !args[i]) {
                console.error('Error: --completion-promise requires a text argument');
                process.exit(1);
            }
            completionPromise = args[i];
        } else {
            promptParts.push(arg);
        }
        i++;
    }

    const prompt = promptParts.join(' ');

    // Validate prompt
    if (!prompt.trim()) {
        console.error('Error: No prompt provided');
        console.error('');
        console.error('  Ralph needs a task description to work on.');
        console.error('');
        console.error('  Examples:');
        console.error('    /ralph-loop Build a REST API for todos');
        console.error('    /ralph-loop Fix the auth bug --max-iterations 20');
        console.error('');
        console.error('  For all options: /ralph-loop --help');
        process.exit(1);
    }

    // Create .claude directory if needed
    if (!fs.existsSync('.claude')) {
        fs.mkdirSync('.claude', { recursive: true });
    }

    // Format completion promise for YAML
    const completionPromiseYaml = (completionPromise !== 'null' && completionPromise)
        ? `"${completionPromise}"`
        : 'null';

    // Get current time as Unix timestamp (milliseconds)
    const startedAtMs = Date.now();

    // Create state file
    const stateContent = `---
active: true
iteration: 1
max_iterations: ${maxIterations}
completion_promise: ${completionPromiseYaml}
started_at_ms: ${startedAtMs}
---

${prompt}`;

    fs.writeFileSync(RALPH_STATE_FILE, stateContent);

    // Output setup message with clear visual banner
    const maxIterDisplay = maxIterations > 0 ? `1/${maxIterations}` : '1 (unlimited)';
    const promiseDisplay = (completionPromise !== 'null' && completionPromise)
        ? `"${completionPromise}"`
        : 'none';

    console.log('');
    console.log('========================================');
    console.log('        RALPH LOOP STARTED');
    console.log('========================================');
    console.log(`  Iteration:  ${maxIterDisplay}`);
    console.log(`  Promise:    ${promiseDisplay}`);
    console.log('========================================');
    console.log('');

    // Output the initial prompt
    if (prompt.trim()) {
        console.log(`Task: ${prompt}`);
        console.log('');
    }

    // Display completion promise instructions if set
    if (completionPromise !== 'null' && completionPromise) {
        console.log(`To complete: output <promise>${completionPromise}</promise>`);
        console.log('(ONLY when the statement is TRUE - do not lie!)');
        console.log('');
    }
}

main();
