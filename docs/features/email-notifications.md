# Email Notifications for User Approval

**Status: Implemented ✓**

## Overview

Approval emails are sent via **Resend** when users are approved (admin approval or invite code redemption).

## Setup

1. Create account at resend.com, verify domain
2. Add DNS records (SPF, DKIM) to Cloudflare
3. `wrangler secret put RESEND_API_KEY`

## Files

| File                                               | Purpose                           |
| -------------------------------------------------- | --------------------------------- |
| `src/cf-worker/email/send-approval-email.ts`       | Sends email via Resend            |
| `src/cf-worker/email/templates/approval-email.tsx` | React Email + Tailwind template   |
| `src/cf-worker/email/stubs/code-block.ts`          | Stub to avoid prismjs in Workers  |
| `src/cf-worker/admin/approve-user.ts`              | Custom approval endpoint          |
| `src/lib/colors.ts`                                | Shared oklch→hex color conversion |

## Cloudflare Workers + React Email

`@react-email/tailwind` has `@react-email/code-block` as optional peer dep, which uses `prismjs` (browser globals). Fix:

1. Use individual imports (`@react-email/body`, etc.) not `@react-email/components`
2. Stub `@react-email/code-block` via Vite alias in `vite.config.ts`
3. Install real package as devDependency for `email:dev` preview

See [GitHub #1508](https://github.com/resend/react-email/issues/1508) for related issue.

## Future

- Cloudflare Email Service (private beta) - migrate when available
- Notify on ban/rejection
- Weekly digest emails
