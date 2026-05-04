const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function readJsonOrNull(response) {
  return response.json().catch(() => null);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await readJsonOrNull(response);

  if (!response.ok) {
    throw new Error(body?.detail || body?.error || `Request failed with ${response.status}`);
  }

  return body;
}

export async function uploadFrame({ frameDataUrl, frameName }) {
  return requestJson('/api/upload-frame', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ frameDataUrl, frameName }),
  });
}

export function buildInviteUrl({ frameUrl, frameName, origin = window.location.origin }) {
  const inviteUrl = new URL('/invitee', origin);
  inviteUrl.searchParams.set('frame', frameUrl);
  inviteUrl.searchParams.set('name', frameName || 'my frame');
  return inviteUrl.toString();
}

export async function signup({ email }) {
  return requestJson('/api/signup', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  });
}
