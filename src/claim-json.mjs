// Strict JSON boundary for new public agent-ledger claim records.
// Modification record: 2026-11-15, chat-a7e4b921 (issue #184).
// JSON.parse discards duplicate object members. Detect duplicates after key
// unescaping before any record-identity or lease validation is attempted.

const MAX_RECORD_BYTES = 8192;
const MAX_NESTING = 32;
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

/** Parse a bounded JSON object without accepting duplicate logical keys. */
export function parseUniqueKeyJsonObject(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_RECORD_BYTES) {
    throw new SyntaxError('invalid or oversized agent claim JSON');
  }

  let index = 0;
  const fail = message => { throw new SyntaxError(message + ' at offset ' + index); };
  const whitespace = () => {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index++;
  };
  const scanString = () => {
    const start = index;
    if (raw[index++] !== '"') fail('expected JSON string');
    while (index < raw.length) {
      const char = raw[index++];
      if (char === '"') return raw.slice(start, index);
      if (char === '\\') {
        // Skip escaped quotes/backslashes as data. JSON.parse validates the escape.
        if (index >= raw.length) fail('unterminated JSON escape');
        index++;
      } else if (char.charCodeAt(0) < 0x20) {
        fail('unescaped control character');
      }
    }
    fail('unterminated JSON string');
  };
  const expect = character => {
    whitespace();
    if (raw[index++] !== character) fail('expected ' + character);
  };

  function object(depth) {
    index++; // {
    const keys = new Set();
    whitespace();
    if (raw[index] === '}') { index++; return; }
    for (;;) {
      whitespace();
      if (raw[index] !== '"') fail('expected object member name');
      const key = JSON.parse(scanString()); // resolve escapes before comparison
      if (keys.has(key)) fail('duplicate JSON member ' + JSON.stringify(key));
      keys.add(key);
      expect(':');
      value(depth + 1);
      whitespace();
      if (raw[index] === '}') { index++; return; }
      expect(',');
    }
  }

  function array(depth) {
    index++; // [
    whitespace();
    if (raw[index] === ']') { index++; return; }
    for (;;) {
      value(depth + 1);
      whitespace();
      if (raw[index] === ']') { index++; return; }
      expect(',');
    }
  }

  function value(depth) {
    if (depth > MAX_NESTING) fail('JSON nesting limit exceeded');
    whitespace();
    if (raw[index] === '{') return object(depth);
    if (raw[index] === '[') return array(depth);
    if (raw[index] === '"') { scanString(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (raw.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = raw.slice(index).match(JSON_NUMBER);
    if (number) { index += number[0].length; return; }
    fail('invalid JSON value');
  }

  whitespace();
  if (raw[index] !== '{') fail('claim must be a JSON object');
  value(0);
  whitespace();
  if (index !== raw.length) fail('trailing JSON data');
  // Native parsing remains the final authority on JSON grammar and values.
  const result = JSON.parse(raw);
  if (result === null || Array.isArray(result) || typeof result !== 'object') {
    fail('claim must be a JSON object');
  }
  return result;
}
