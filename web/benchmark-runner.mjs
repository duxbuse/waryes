import { chromium } from 'playwright';

(async () => {
  console.log('Launching Chromium (headed mode for GPU rendering)...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-gpu',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  const benchmarkMessages = [];
  let benchmarkComplete = false;

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('BENCHMARK')) {
      console.log(`  [Console] ${text}`);
      benchmarkMessages.push(text);
      if (text.includes('BENCHMARK COMPLETE') || text.includes('BENCHMARK_COMPLETE')) {
        benchmarkComplete = true;
      }
    }
  });

  page.on('pageerror', (err) => {
    console.log(`  [Page Error] ${err.message}`);
  });

  console.log('Navigating to http://localhost:5173/?benchmark=true ...');
  await page.goto('http://localhost:5173/?benchmark=true', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });

  console.log('Page loaded. Waiting up to 60 seconds for benchmark to complete...');

  const startTime = Date.now();
  const maxWait = 60000;

  while (!benchmarkComplete && (Date.now() - startTime) < maxWait) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    if (elapsed % 10 === 0 && elapsed > 0) {
      console.log(`  ... ${elapsed}s elapsed, waiting for benchmark...`);
    }
  }

  if (!benchmarkComplete) {
    console.log('\nBenchmark did not complete within 60 seconds.');
    console.log('Attempting to read any results from the page...');
    
    try {
      const pageContent = await page.evaluate(() => {
        const overlay = document.querySelector('.benchmark-overlay, .benchmark-results, #benchmark-results');
        if (overlay) return overlay.textContent;
        
        const body = document.body.innerText;
        const lines = body.split('\n').filter(l => l.includes('FPS') || l.includes('Benchmark') || l.includes('benchmark'));
        return lines.join('\n');
      });
      
      if (pageContent) {
        console.log('Page content with benchmark info:');
        console.log(pageContent);
      }
    } catch (e) {
      console.log('Could not read page content:', e.message);
    }
  }

  console.log('\n========================================');
  console.log('BENCHMARK RESULTS SUMMARY');
  console.log('========================================');
  
  if (benchmarkMessages.length > 0) {
    for (const msg of benchmarkMessages) {
      console.log(msg);
    }
  } else {
    console.log('No BENCHMARK messages were captured from console.');
    console.log('The benchmark may not have started or uses a different output method.');
  }
  
  console.log('========================================');

  await browser.close();
  console.log('Browser closed. Done.');
})();
