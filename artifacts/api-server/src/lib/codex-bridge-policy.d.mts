export interface CodexExecutorGrant {
  job_id: string;
  expires_at: number;
  revoked?: boolean;
}
export function isCodexBridgeRequestAllowed(
  grant: CodexExecutorGrant | null | undefined,
  body: Record<string, unknown> | null,
  now?: number,
): boolean;
