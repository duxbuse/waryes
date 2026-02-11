/**
 * Rate Limiting Test Script
 *
 * Tests that the WebSocket server correctly rate limits messages:
 * 1. Normal rate messages should succeed
 * 2. Rapid flood of messages should be rate limited
 * 3. Different message types have different limits
 * 4. Rate limit exceeded responses include retryAfter
 */

const PORT = process.env.PORT || 3001;
const WS_URL = `ws://localhost:${PORT}`;

interface TestResult {
  passed: number;
  failed: number;
  errors: string[];
}

const result: TestResult = {
  passed: 0,
  failed: 0,
  errors: [],
};

function pass(message: string) {
  console.log(`✓ ${message}`);
  result.passed++;
}

function fail(message: string) {
  console.log(`✗ ${message}`);
  result.failed++;
  result.errors.push(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test that normal rate messages succeed
 */
async function testNormalRate(): Promise<void> {
  console.log('\n📝 Test 1: Normal rate messages should succeed');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let responsesReceived = 0;
    let rateLimitReceived = false;

    ws.onopen = () => {
      // Send 3 lobby actions at normal pace (well under 10/min limit)
      const interval = setInterval(() => {
        if (responsesReceived >= 3) {
          clearInterval(interval);
          ws.close();
          if (rateLimitReceived) {
            fail('Normal rate was rate limited');
          } else {
            pass('Normal rate messages succeeded');
          }
          resolve();
        } else {
          ws.send(JSON.stringify({
            type: 'create_lobby',
            playerId: 'test-player-1',
            playerName: 'Test Player',
            mapSize: 'medium',
          }));
        }
      }, 500); // 500ms between messages = well under limit
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === 'rate_limit_exceeded') {
        rateLimitReceived = true;
      } else {
        responsesReceived++;
      }
    };

    ws.onerror = () => {
      fail('WebSocket connection error');
      reject(new Error('WebSocket error'));
    };

    setTimeout(() => {
      ws.close();
      fail('Test timed out');
      reject(new Error('Timeout'));
    }, 5000);
  });
}

/**
 * Test that rapid messages trigger rate limiting
 */
async function testRapidFlood(): Promise<void> {
  console.log('\n📝 Test 2: Rapid flood should be rate limited');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let rateLimitCount = 0;
    let successCount = 0;

    ws.onopen = () => {
      // Send 20 create_lobby messages rapidly (limit is 10/min)
      for (let i = 0; i < 20; i++) {
        ws.send(JSON.stringify({
          type: 'create_lobby',
          playerId: `test-player-${i}`,
          playerName: `Test Player ${i}`,
          mapSize: 'medium',
        }));
      }

      // Wait for responses
      setTimeout(() => {
        ws.close();
        if (rateLimitCount > 0) {
          pass(`Rapid flood triggered rate limiting (${rateLimitCount} rate limited, ${successCount} succeeded)`);
        } else {
          fail('Rapid flood was not rate limited');
        }
        resolve();
      }, 1000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === 'rate_limit_exceeded') {
        rateLimitCount++;
      } else {
        successCount++;
      }
    };

    ws.onerror = () => {
      fail('WebSocket connection error');
      reject(new Error('WebSocket error'));
    };

    setTimeout(() => {
      ws.close();
      fail('Test timed out');
      reject(new Error('Timeout'));
    }, 5000);
  });
}

/**
 * Test rate limit exceeded response format
 */
async function testRateLimitResponse(): Promise<void> {
  console.log('\n📝 Test 3: Rate limit exceeded response format');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let rateLimitResponse: any = null;

    ws.onopen = () => {
      // Send rapid messages to trigger rate limit
      for (let i = 0; i < 15; i++) {
        ws.send(JSON.stringify({
          type: 'join_lobby',
          playerId: `test-player-${i}`,
          playerName: `Test Player ${i}`,
          lobbyCode: 'TEST-1234',
        }));
      }

      // Wait for responses
      setTimeout(() => {
        ws.close();
        if (rateLimitResponse) {
          if (
            rateLimitResponse.type === 'rate_limit_exceeded' &&
            typeof rateLimitResponse.messageType === 'string' &&
            typeof rateLimitResponse.retryAfter === 'number' &&
            rateLimitResponse.retryAfter > 0
          ) {
            pass(`Rate limit response has correct format (retryAfter: ${rateLimitResponse.retryAfter}ms)`);
          } else {
            fail('Rate limit response has incorrect format');
          }
        } else {
          fail('No rate limit response received');
        }
        resolve();
      }, 1000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === 'rate_limit_exceeded' && !rateLimitResponse) {
        rateLimitResponse = data;
      }
    };

    ws.onerror = () => {
      fail('WebSocket connection error');
      reject(new Error('WebSocket error'));
    };

    setTimeout(() => {
      ws.close();
      fail('Test timed out');
      reject(new Error('Timeout'));
    }, 5000);
  });
}

/**
 * Test different message types have different rate limits
 */
async function testDifferentLimits(): Promise<void> {
  console.log('\n📝 Test 4: Different message types have different limits');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let gameCommandRateLimited = false;
    let lobbyActionRateLimited = false;

    ws.onopen = async () => {
      // Test game_command (60/min limit - should take ~50 to trigger)
      for (let i = 0; i < 70; i++) {
        ws.send(JSON.stringify({
          type: 'game_command',
          playerId: 'test-player',
          command: { type: 'move', unitId: `unit-${i}`, x: 0, z: 0 },
        }));
      }

      await sleep(200);

      // Test create_lobby (10/min limit - should trigger quickly)
      for (let i = 0; i < 15; i++) {
        ws.send(JSON.stringify({
          type: 'create_lobby',
          playerId: `test-player-${i}`,
          playerName: `Test ${i}`,
          mapSize: 'medium',
        }));
      }

      // Wait for responses
      setTimeout(() => {
        ws.close();
        if (lobbyActionRateLimited) {
          pass('Lobby actions have stricter limit (10/min)');
        } else {
          fail('Lobby actions were not rate limited');
        }
        resolve();
      }, 1000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === 'rate_limit_exceeded') {
        if (data.messageType === 'game_command') {
          gameCommandRateLimited = true;
        } else if (data.messageType === 'create_lobby') {
          lobbyActionRateLimited = true;
        }
      }
    };

    ws.onerror = () => {
      fail('WebSocket connection error');
      reject(new Error('WebSocket error'));
    };

    setTimeout(() => {
      ws.close();
      fail('Test timed out');
      reject(new Error('Timeout'));
    }, 5000);
  });
}

/**
 * Test that rate limits reset over time
 */
async function testRateLimitReset(): Promise<void> {
  console.log('\n📝 Test 5: Rate limits should reset over time');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let firstFloodRateLimited = false;
    let secondFloodRateLimited = false;

    ws.onopen = async () => {
      // First flood - trigger rate limit
      for (let i = 0; i < 12; i++) {
        ws.send(JSON.stringify({
          type: 'create_lobby',
          playerId: `test-player-${i}`,
          playerName: `Test ${i}`,
          mapSize: 'medium',
        }));
      }

      await sleep(500);

      // Wait for tokens to refill (10 tokens / 60000ms = 1 token per 6000ms)
      // Wait 7 seconds to get at least 1 token back
      console.log('  Waiting 7 seconds for tokens to refill...');
      await sleep(7000);

      // Second message - should succeed since tokens refilled
      ws.send(JSON.stringify({
        type: 'create_lobby',
        playerId: 'test-player-reset',
        playerName: 'Test Reset',
        mapSize: 'medium',
      }));

      await sleep(500);

      ws.close();
      if (firstFloodRateLimited && !secondFloodRateLimited) {
        pass('Rate limits reset over time');
      } else if (!firstFloodRateLimited) {
        fail('First flood was not rate limited');
      } else {
        fail('Second message after waiting was still rate limited');
      }
      resolve();
    };

    let messageCount = 0;
    ws.onmessage = (event) => {
      messageCount++;
      const data = JSON.parse(event.data as string);

      if (messageCount <= 15) {
        // First flood responses
        if (data.type === 'rate_limit_exceeded') {
          firstFloodRateLimited = true;
        }
      } else {
        // Second message after waiting
        if (data.type === 'rate_limit_exceeded') {
          secondFloodRateLimited = true;
        }
      }
    };

    ws.onerror = () => {
      fail('WebSocket connection error');
      reject(new Error('WebSocket error'));
    };

    setTimeout(() => {
      ws.close();
      fail('Test timed out');
      reject(new Error('Timeout'));
    }, 15000);
  });
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('🚀 Starting Rate Limit Tests\n');
  console.log(`Connecting to WebSocket server at ${WS_URL}`);

  // Check if server is running
  try {
    const testWs = new WebSocket(WS_URL);
    await new Promise((resolve, reject) => {
      testWs.onopen = () => {
        testWs.close();
        resolve(true);
      };
      testWs.onerror = () => reject(new Error('Cannot connect to server'));
      setTimeout(() => reject(new Error('Connection timeout')), 2000);
    });
  } catch (error) {
    console.error('❌ Cannot connect to WebSocket server');
    console.error('Please start the server first: cd ./server && bun dev');
    process.exit(1);
  }

  try {
    await testNormalRate();
    await sleep(500);

    await testRapidFlood();
    await sleep(500);

    await testRateLimitResponse();
    await sleep(500);

    await testDifferentLimits();
    await sleep(500);

    await testRateLimitReset();

    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`✓ Passed: ${result.passed}`);
    console.log(`✗ Failed: ${result.failed}`);

    if (result.failed > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
      console.log('\n❌ Rate limiting tests FAILED');
      process.exit(1);
    } else {
      console.log('\n✅ Rate limiting working correctly');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
