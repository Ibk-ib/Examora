/**
 * Route guards. These only decide what the UI shows; the API remains the authority.
 * Returns a path to redirect to, or null when access is allowed.
 */
import { homePath, isAdmin } from './auth.js';

export function checkAccess(route, session, requestedPath) {
  if (route.public) {
    // Signed-in users have no business on the sign-in / register pages.
    return session ? homePath(session) : null;
  }
  if (!session) return `/login?next=${encodeURIComponent(requestedPath)}`;
  if (route.role === 'admin' && !isAdmin(session)) return homePath(session);
  if (route.role === 'student' && isAdmin(session)) return homePath(session);
  return null;
}
