/* eslint-disable */
// Fixture: intentionally contains the error-leak pattern with 'e' binding.
// Used by errorMessageScrubbing.test.js to verify LEAK_PATTERN matches any
// catch-binding name, not just 'err' (issue #53).
async function handler(event) {
  try {
    await doSomething(event);
    return { statusCode: 200 };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
