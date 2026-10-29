import { createClerkClient } from '@clerk/express';

// Trusted-operator command, never mounted as an HTTP endpoint. Resolve only;
// granting access is a separate explicit secure configuration action.
const email = process.env.STUDIO_OWNER_ENROLL_EMAIL?.trim();
if (!email || !process.env.CLERK_SECRET_KEY) {
  throw new Error('Configure STUDIO_OWNER_ENROLL_EMAIL securely in the target environment before running owner:inspect.');
}
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const result = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
if (result.totalCount !== 1 || result.data.length !== 1) {
  throw new Error('Expected exactly one existing owner account. No access granted.');
}
const user = result.data[0];
if (!user.emailAddresses.some(e => e.emailAddress.toLowerCase() === email.toLowerCase() && e.verification?.status === 'verified')) {
  throw new Error('Owner email ownership is not verified. No access granted.');
}
console.log('Verified account stable ownership ID:', user.externalId ?? user.id);
console.log('No access granted. A trusted operator must check existing data ownership, then configure STUDIO_OWNER_ID using the secure admin flow.');
