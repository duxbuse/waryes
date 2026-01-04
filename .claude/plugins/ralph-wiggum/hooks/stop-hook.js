#!/usr/bin/env node
// Ralph Wiggum Stop Hook (Node.js)
// Prevents session exit when a ralph-loop is active
// Feeds Claude's output back as input to continue the loop

const fs = require('fs');

const RALPH_STATE_FILE = '.claude/ralph-loop.local.md';

function loopError(reason, details = null) {
    console.error('');
    console.error('========================================');
    console.error('        RALPH LOOP STOPPED (ERROR)');
    console.error('========================================');
    console.error(`  Reason: ${reason}`);
    if (details) {
        console.error(`  Detail: ${details}`);
    }
    console.error('========================================');
    console.error('');
    try { fs.unlinkSync(RALPH_STATE_FILE); } catch {}
    process.exit(0);
}

async function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');

        process.stdin.on('readable', () => {
            let chunk;
            while ((chunk = process.stdin.read()) !== null) {
                data += chunk;
            }
        });

        process.stdin.on('end', () => {
            resolve(data);
        });

        // Timeout after 5 seconds if no data
        setTimeout(() => resolve(data), 5000);
    });
}

async function main() {
    // Check if ralph-loop is active
    if (!fs.existsSync(RALPH_STATE_FILE)) {
        process.exit(0);
    }

    // Read state file
    let stateContent;
    try {
        stateContent = fs.readFileSync(RALPH_STATE_FILE, 'utf8');
    } catch (e) {
        loopError('Failed to read state file');
    }

    // Parse frontmatter
    const frontmatterMatch = stateContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
        loopError('State file corrupted', 'No frontmatter found');
    }

    const frontmatter = frontmatterMatch[1];

    // Parse YAML fields
    let iteration = 0;
    let maxIterations = 0;
    let completionPromise = 'null';
    let startedAtMs = null;

    for (const line of frontmatter.split('\n')) {
        const trimmed = line.trim();
        let match;
        if ((match = trimmed.match(/^iteration:\s*(\d+)/))) {
            iteration = parseInt(match[1], 10);
        } else if ((match = trimmed.match(/^max_iterations:\s*(\d+)/))) {
            maxIterations = parseInt(match[1], 10);
        } else if ((match = trimmed.match(/^completion_promise:\s*"([^"]*)"/))) {
            completionPromise = match[1];
        } else if (trimmed.match(/^completion_promise:\s*null/)) {
            completionPromise = 'null';
        } else if ((match = trimmed.match(/^started_at_ms:\s*(\d+)/))) {
            startedAtMs = parseInt(match[1], 10);
        }
    }

    // Helper function to format elapsed time from Unix timestamp (milliseconds)
    function formatElapsedTime(startMs) {
        if (!startMs || typeof startMs !== 'number') return 'unknown';

        const nowMs = Date.now();
        const elapsedMs = nowMs - startMs;

        // Sanity check: if elapsed time is negative or unreasonably large, something went wrong
        if (elapsedMs < 0) {
            return 'unknown (clock skew)';
        }
        if (elapsedMs > 86400000 * 7) { // More than 7 days
            return 'unknown (start time too old)';
        }

        const seconds = Math.floor(elapsedMs / 1000) % 60;
        const minutes = Math.floor(elapsedMs / 60000) % 60;
        const hours = Math.floor(elapsedMs / 3600000);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // Check if max iterations reached
    if (maxIterations > 0 && iteration >= maxIterations) {
        console.error('');
        console.error('========================================');
        console.error('        RALPH LOOP COMPLETE');
        console.error('========================================');
        console.error(`  Reason:     Max iterations reached`);
        console.error(`  Iterations: ${iteration}/${maxIterations}`);
        console.error(`  Total time: ${formatElapsedTime(startedAtMs)}`);
        console.error('========================================');
        console.error('');
        fs.unlinkSync(RALPH_STATE_FILE);
        process.exit(0);
    }

    // Read hook input from stdin
    const hookInput = await readStdin();

    let transcriptPath = null;
    if (hookInput.trim()) {
        try {
            const hookData = JSON.parse(hookInput);
            transcriptPath = hookData.transcript_path;
        } catch (e) {
            console.error('Ralph loop: Failed to parse hook input JSON');
        }
    }

    if (!transcriptPath) {
        loopError('No transcript path', 'stdin empty or malformed');
    }

    if (!fs.existsSync(transcriptPath)) {
        loopError('Transcript file not found', transcriptPath);
    }

    // Read transcript and find last assistant message
    let transcriptLines;
    try {
        transcriptLines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
    } catch (e) {
        loopError('Failed to read transcript');
    }

    const assistantLines = transcriptLines.filter(line => line.includes('"role":"assistant"') || line.includes('"role": "assistant"'));

    if (assistantLines.length === 0) {
        loopError('No assistant messages in transcript');
    }

    const lastLine = assistantLines[assistantLines.length - 1];
    let lastOutput = '';

    try {
        const lastMessage = JSON.parse(lastLine);
        const textContent = (lastMessage.message?.content || [])
            .filter(c => c.type === 'text')
            .map(c => c.text);
        lastOutput = textContent.join('\n');
    } catch (e) {
        loopError('Failed to parse assistant message');
    }

    // If no text content, the assistant made tool-only calls - this is valid, continue the loop
    const isToolOnlyResponse = !lastOutput.trim();

    // Check for completion promise (only if there's text content to check)
    // IMPORTANT: Only match promises that appear "standalone" - on their own line
    // This prevents false positives when the promise is mentioned as an example
    // e.g., "I cannot output <promise>GAME COMPLETE</promise>" should NOT trigger completion
    if (!isToolOnlyResponse && completionPromise !== 'null' && completionPromise) {
        // Match promise only if it's on its own line (with optional whitespace)
        // This regex requires the promise tag to be at the start of a line (after optional whitespace)
        const standalonePromiseRegex = /(?:^|\n)\s*<promise>([\s\S]*?)<\/promise>\s*(?:\n|$)/i;
        const promiseMatch = lastOutput.match(standalonePromiseRegex);

        if (promiseMatch) {
            const promiseText = promiseMatch[1].trim();
            if (promiseText === completionPromise) {
                console.error('');
                console.error('========================================');
                console.error('        RALPH LOOP COMPLETE');
                console.error('========================================');
                console.error(`  Reason:     Promise fulfilled!`);
                console.error(`  Promise:    "${completionPromise}"`);
                console.error(`  Iterations: ${iteration}`);
                console.error(`  Total time: ${formatElapsedTime(startedAtMs)}`);
                console.error('========================================');
                console.error('');
                fs.unlinkSync(RALPH_STATE_FILE);
                process.exit(0);
            }
        }
    }

    // Not complete - continue loop
    const nextIteration = iteration + 1;

    // Extract prompt (everything after closing ---)
    const lines = stateContent.split('\n');
    let promptText = '';
    let dashCount = 0;
    let inPrompt = false;

    for (const line of lines) {
        if (line.trim() === '---') {
            dashCount++;
            if (dashCount === 2) {
                inPrompt = true;
                continue;
            }
        }
        if (inPrompt) {
            promptText += line + '\n';
        }
    }
    promptText = promptText.trim();

    if (!promptText) {
        loopError('State file corrupted', 'No prompt text found');
    }

    // Update iteration in state file
    const updatedContent = stateContent.replace(/iteration:\s*\d+/, `iteration: ${nextIteration}`);
    try {
        fs.writeFileSync(RALPH_STATE_FILE, updatedContent);
    } catch (e) {
        console.error('Ralph loop: Failed to update state file');
    }

    // Build system message
    let systemMsg;
    if (completionPromise !== 'null' && completionPromise) {
        systemMsg = `Ralph iteration ${nextIteration} | To stop: output <promise>${completionPromise}</promise> (ONLY when TRUE)`;
    } else {
        systemMsg = `Ralph iteration ${nextIteration} | No completion promise - runs infinitely`;
    }

    // Print visible loop status to stderr (so user can see it)
    const iterDisplay = maxIterations > 0 ? `${nextIteration}/${maxIterations}` : `${nextIteration}`;
    const promiseDisplay = (completionPromise !== 'null' && completionPromise)
        ? `"${completionPromise}"`
        : 'none';

    console.error('');
    console.error('========================================');
    console.error('        RALPH LOOP CONTINUING');
    console.error('========================================');
    console.error(`  Iteration:  ${iterDisplay}`);
    console.error(`  Promise:    ${promiseDisplay}`);
    if (isToolOnlyResponse) {
        console.error(`  Note:       Tool-only response (no text)`);
    }
    console.error('========================================');
    console.error('');

    // Output JSON to block the stop (to stdout)
    // Note: The "reason" field is displayed by Claude Code as "Stop hook error: [reason]"
    // So we use a short message here, and put the actual prompt in systemMessage
    const output = {
        decision: 'block',
        reason: `Ralph loop continuing (iteration ${iterDisplay})`,
        systemMessage: `${systemMsg}\n\nTask: ${promptText}`
    };

    console.log(JSON.stringify(output));
    process.exit(0);
}

main().catch(e => {
    console.error('Ralph loop: Unexpected error:', e.message);
    process.exit(0);
});
