import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBatcher } from '../lib/grid-batch.ts';

test('der batcher meldet volle bloecke und den rest beim flush', () => {
  const bloecke: number[][] = [];
  const batcher = createBatcher<number>(3, (items) => bloecke.push([...items]));

  for (const zahl of [1, 2, 3, 4, 5]) batcher.push(zahl);
  assert.deepEqual(bloecke, [[1, 2, 3]], 'der Rest wartet auf den flush');

  batcher.flush();
  assert.deepEqual(bloecke, [
    [1, 2, 3],
    [4, 5],
  ]);
});

test('ein flush ohne inhalt meldet nichts', () => {
  let aufrufe = 0;
  const batcher = createBatcher<number>(3, () => (aufrufe += 1));

  batcher.flush();
  batcher.flush();
  assert.equal(aufrufe, 0);
});

test('ohne rueckmeldung sammelt der batcher stillschweigend', () => {
  const batcher = createBatcher<number>(2);
  assert.doesNotThrow(() => {
    batcher.push(1);
    batcher.push(2);
    batcher.flush();
  });
});
