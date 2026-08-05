/** Read Pro status from the session user blob (set at login / status refresh). */
export function getIsPro() {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    return user?.is_pro === true;
  } catch {
    return false;
  }
}

/** Persist Pro entitlement onto the session user object. */
export function setSessionIsPro(isPro) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('user') || '{}');
    sessionStorage.setItem('user', JSON.stringify({ ...parsed, is_pro: Boolean(isPro) }));
  } catch {
    // ignore malformed session payloads
  }
}
