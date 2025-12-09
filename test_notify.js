import { sendBarkNotification } from './utils/notify.js'

// Use TEST_BARK_TARGET env or default to httpbin which echoes requests
const target = process.env.TEST_BARK_TARGET || 'https://httpbin.org/anything/';

console.log('Testing Bark target:', target);

console.log('\n1) Short body -> expect GET (or GET succeed)');
await sendBarkNotification(target, 'Test Title GET', 'Short body', 'TEST', 'https://example.com');
console.log('Done GET test');

console.log('\n2) Long body -> expect POST');
const longBody = 'X'.repeat(2000);
await sendBarkNotification(target, 'Test Title POST', longBody, 'TEST', 'https://example.com');
console.log('Done POST test');

console.log('\nAll tests finished');
