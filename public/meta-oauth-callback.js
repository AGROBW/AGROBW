(function () {
  const params = new URLSearchParams(window.location.search);
  const payload = {
    source: 'meta-oauth-callback',
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    error_description: params.get('error_description'),
  };

  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, window.location.origin);
  }

  window.setTimeout(() => window.close(), 1200);
})();
