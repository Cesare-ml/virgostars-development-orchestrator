import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTaskCatalog} from '../src/resources.mjs';
const repo = 'ExampleOrg/portable-validation';
const catalog = root => [{repository:repo,issue:401,role:'developer',access:'write',
  resource_scope:{id:'portable-check',roots:[root]}}];
const valid = root => validateTaskCatalog(catalog(root));

test('reject Git metadata directory spelling and nested segments', () => {
  for (const root of ['.git','test/.GIT/config', '.GiT/config', 'test/.git/']) {
    assert.throws(() => valid(root), /Write tasks require one valid partition/, root);
  }
});
test('reject Windows device names and trailing-dot segments in exact file paths', () => {
  for (const root of ['test/CON.txt', 'test/nul.X', 'test/AUX', 'test/prn.log',
    'test/COM1.mjs', 'test/com9', 'test/LPT1.foo', 'test/lpt9', 'test/file.',
    'test/foo./bar.txt']) {
    assert.throws(() => valid(root), /Write tasks require one valid partition/, root);
  }
});
test('portable sibling paths, hidden files and directory partitions still work', () => {
  for (const root of ['test/console.txt', 'test/com10.txt', 'test/lpt10',
    'test/.gitignore', '.github/config.json', 'test/auxiliary.js',
    'test/valid.file.mjs', 'test/valid/subdir/']) {
    assert.doesNotThrow(() => valid(root), root);
  }
});
