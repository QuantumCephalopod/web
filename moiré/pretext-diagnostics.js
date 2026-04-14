(function initPretextDiagnostics(global) {
  const FAILURE_RUNTIME_IMPORT = 'runtime-import-failed';
  const FAILURE_CORE_API_MISSING = 'core-api-missing';
  const FAILURE_RENDER_EXCEPTION = 'render-exception';

  function getErrorMessage(errorLike) {
    if (errorLike instanceof Error && errorLike.message) return errorLike.message;
    if (errorLike && typeof errorLike.message === 'string') return errorLike.message;
    return String(errorLike ?? 'unknown error');
  }

  function formatFailureStatusText(failureKind, reason) {
    return `Pretext unavailable (${failureKind}). Rendering is disabled to keep Pretext as source of truth. ${reason}`;
  }

  function applyFailureStatus(statusEl, failureKind, reason) {
    if (!statusEl) return;
    statusEl.style.display = '';
    statusEl.dataset.state = 'failed';
    statusEl.dataset.failureKind = failureKind;
    statusEl.textContent = formatFailureStatusText(failureKind, reason);
  }

  function clearStatus(statusEl) {
    if (!statusEl) return;
    statusEl.dataset.state = 'ready';
    statusEl.dataset.failureKind = 'none';
    statusEl.style.display = 'none';
  }

  function resolveRuntimeImportReason(detail) {
    return (
      (detail && detail.message) ||
      (detail && detail.error && detail.error.message) ||
      (detail && detail.error) ||
      'Runtime import failed.'
    );
  }

  function handlePretextFailedEvent(statusEl, eventLike) {
    const detail = eventLike && eventLike.detail ? eventLike.detail : null;
    const failureKind = (detail && detail.failureKind) || FAILURE_RUNTIME_IMPORT;
    const reason = resolveRuntimeImportReason(detail);
    applyFailureStatus(statusEl, failureKind, reason);
    return { failureKind, reason };
  }

  function requirePretextCore(pretextFailed, pretext, onFailure) {
    if (pretextFailed) return null;
    const core = pretext && pretext.core;
    const ready = core && typeof core.prepareWithSegments === 'function' && typeof core.layoutWithLines === 'function';
    if (ready) return core;
    if (typeof onFailure === 'function') {
      onFailure(FAILURE_CORE_API_MISSING, 'Core APIs were not found.');
    }
    return null;
  }

  function runRenderSafely(renderFn, onFailure) {
    try {
      return renderFn();
    } catch (error) {
      const message = getErrorMessage(error);
      if (typeof onFailure === 'function') {
        onFailure(FAILURE_RENDER_EXCEPTION, `render exception: ${message}`, error);
      }
      return null;
    }
  }

  const api = {
    FAILURE_RUNTIME_IMPORT,
    FAILURE_CORE_API_MISSING,
    FAILURE_RENDER_EXCEPTION,
    applyFailureStatus,
    clearStatus,
    formatFailureStatusText,
    handlePretextFailedEvent,
    requirePretextCore,
    runRenderSafely,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.pretextStatusDiagnostics = api;
})(typeof window !== 'undefined' ? window : globalThis);
