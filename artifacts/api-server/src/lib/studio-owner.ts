// The verified legacy subject is carried in sessionClaims.userId, NOT JWT sub.
// Never authorize by display name, username, email, first registration, or REPL_OWNER_ID.
export function isStudioOwner(claims: { userId?: unknown } | null | undefined, ownerId: string | undefined): boolean {
  return !!ownerId && typeof claims?.userId === 'string' && claims.userId === ownerId;
}

export function resolveStudioOwner(
  claims: Record<string, unknown> | null | undefined,
  authenticatedId: string | undefined,
  dataOwnerId: string | undefined = authenticatedId,
) {
  if (!dataOwnerId || !isStudioOwner(claims, authenticatedId)) return null;
  return {
    userId: dataOwnerId,
    displayName: [claims!.firstName, claims!.lastName].filter(v => typeof v === 'string' && v).join(' ') || '所有者',
    email: typeof claims!.email === 'string' ? claims!.email : '',
    fullName: [claims!.firstName, claims!.lastName].filter(v => typeof v === 'string' && v).join(' ') || null,
  };
}

export function resolveConfiguredStudioOwner(
  claims: Record<string, unknown> | null | undefined,
  config: { NODE_ENV?: string; STUDIO_OWNER_ID?: string; STUDIO_OWNER_PRODUCTION_AUTH_ID?: string },
) {
  const dataOwnerId = config.STUDIO_OWNER_ID;
  const authenticatedId = config.NODE_ENV === 'production'
    ? config.STUDIO_OWNER_PRODUCTION_AUTH_ID
    : dataOwnerId;
  if (!dataOwnerId || !authenticatedId) return null;
  return resolveStudioOwner(claims, authenticatedId, dataOwnerId);
}
