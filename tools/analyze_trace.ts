
import fs from 'fs';
import path from 'path';

const tracePath = path.join(process.cwd(), 'Trace-20260111T185956.json');

try {
    const data = fs.readFileSync(tracePath, 'utf-8');
    const trace = JSON.parse(data);
    const events = trace.traceEvents || (Array.isArray(trace) ? trace : []);

    console.log(`Total events: ${events.length}`);

    const functionTimes: { [key: string]: { count: number, totalDur: number, maxDur: number } } = {};

    events.forEach((e: any) => {
        let name = '';

        // Check for FunctionCall with explicit functionName
        if (e.name === 'FunctionCall' && e.args && e.args.data && e.args.data.functionName) {
            name = e.args.data.functionName;
        }
        // Check for JSFrame (often in newer traces or sampling profiles)
        else if (e.name === 'JSFrame' && e.args && e.args.data && e.args.data.functionName) {
            name = e.args.data.functionName;
        }

        if (name) {
            if (!functionTimes[name]) functionTimes[name] = { count: 0, totalDur: 0, maxDur: 0 };
            functionTimes[name].count++;
            functionTimes[name].totalDur += (e.dur || 0);
            if ((e.dur || 0) > functionTimes[name].maxDur) functionTimes[name].maxDur = (e.dur || 0);
        }
    });

    const sortedFunctions = Object.keys(functionTimes).sort((a, b) => functionTimes[b].totalDur - functionTimes[a].totalDur);

    console.log('\nTop 30 Most Expensive JS Functions (Cumulative):');
    sortedFunctions.slice(0, 30).forEach((name, i) => {
        const stats = functionTimes[name];
        console.log(`${i + 1}. ${name}: ${(stats.totalDur / 1000).toFixed(2)}ms (Count: ${stats.count}, Max: ${(stats.maxDur / 1000).toFixed(2)}ms)`);
    });

} catch (err) {
    console.error('Error reading/parsing trace:', err);
}
