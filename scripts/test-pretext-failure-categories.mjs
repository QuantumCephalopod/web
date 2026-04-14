#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const diagnostics = require('../moiré/pretext-diagnostics.js');

function createStatusEl() {
  return {
    dataset: {},
    style: {},
    textContent: '',
  };
}

test('runtime import failure path sets machine-checkable runtime category markers', () => {
  const statusEl = createStatusEl();
  const event = {
    detail: {
      failureKind: diagnostics.FAILURE_RUNTIME_IMPORT,
      message: 'Synthetic runtime import failure',
    },
  };

  const result = diagnostics.handlePretextFailedEvent(statusEl, event);

  assert.equal(result.failureKind, 'runtime-import-failed');
  assert.equal(statusEl.dataset.state, 'failed');
  assert.equal(statusEl.dataset.failureKind, 'runtime-import-failed');
  assert.equal(
    statusEl.textContent,
    'Pretext unavailable (runtime-import-failed). Rendering is disabled to keep Pretext as source of truth. Synthetic runtime import failure',
  );
});

test('missing core API path reports core-api-missing via requirePretextCore', () => {
  const statusEl = createStatusEl();
  const core = diagnostics.requirePretextCore(false, { core: {} }, (failureKind, reason) => {
    diagnostics.applyFailureStatus(statusEl, failureKind, reason);
  });

  assert.equal(core, null);
  assert.equal(statusEl.dataset.state, 'failed');
  assert.equal(statusEl.dataset.failureKind, 'core-api-missing');
  assert.equal(
    statusEl.textContent,
    'Pretext unavailable (core-api-missing). Rendering is disabled to keep Pretext as source of truth. Core APIs were not found.',
  );
});

test('render exception path reports render-exception for forced bad call', () => {
  const statusEl = createStatusEl();
  diagnostics.runRenderSafely(
    () => {
      const forced = {};
      forced.__forcedBadCall();
    },
    (failureKind, reason) => {
      diagnostics.applyFailureStatus(statusEl, failureKind, reason);
    },
  );

  assert.equal(statusEl.dataset.state, 'failed');
  assert.equal(statusEl.dataset.failureKind, 'render-exception');
  assert.match(statusEl.textContent, /^Pretext unavailable \(render-exception\)\./);
  assert.match(statusEl.textContent, /render exception:/);
});
