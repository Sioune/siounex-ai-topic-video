// OIDC display names and mutable profile fields are not authorization identities.
export function isStudioOwner(claims: { sub?: unknown }, ownerId: string | undefined): boolean {
  return !!ownerId && typeof claims.sub === 'string' && claims.sub === ownerId;
}
