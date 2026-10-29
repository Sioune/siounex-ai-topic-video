// The verified legacy subject is carried in sessionClaims.userId, NOT JWT sub.
// Never authorize by display name, username, email, first registration, or REPL_OWNER_ID.
export function isStudioOwner(claims: { userId?: unknown } | null | undefined, ownerId: string | undefined): boolean {
  return !!ownerId && typeof claims?.userId === 'string' && claims.userId === ownerId;
}

export function resolveStudioOwner(claims: Record<string, unknown> | null | undefined, ownerId: string | undefined) {
  if (!isStudioOwner(claims, ownerId)) return null;
  return {
    userId: claims!.userId as string,
    displayName: [claims!.firstName, claims!.lastName].filter(v => typeof v === 'string' && v).join(' ') || '所有者',
    email: typeof claims!.email === 'string' ? claims!.email : '',
    fullName: [claims!.firstName, claims!.lastName].filter(v => typeof v === 'string' && v).join(' ') || null,
  };
}
