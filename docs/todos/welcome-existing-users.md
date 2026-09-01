# Approve pending users and send the launch welcome email

Run one bounded launch operation for the users who signed up before Cloudstash
became generally available.

## Outcome

- Approve every eligible account still waiting for access.
- Send every existing signed-up user a welcome email stating that Cloudstash is
  available to use, with one clear sign-in call to action.
- Leave no user trapped in the old pending-approval flow.

## Execution shape

- Use the existing account approval path and existing email provider.
- Produce a dry-run recipient count before changing accounts or sending email.
- Exclude deleted accounts and addresses that are not valid delivery targets.
- Approve pending accounts before attempting their email so an email-provider
  failure cannot leave access blocked.
- Use one stable campaign identifier and provider-supported idempotency so a
  retry cannot send duplicate welcome emails. Do not add a new application
  database table solely for this one-time operation.
- Record aggregate attempted, delivered/accepted, skipped, and failed counts;
  retain only the minimum recipient-level failure evidence needed for retry.

## Email

Keep the message short and human:

- Cloudstash is now available.
- The recipient can sign in with their existing account.
- One sentence on saving and finding links.
- Primary action: **Open Cloudstash**.

Preview the final light and dark email rendering before the real send.

## Completion

- Dry-run population is reviewed by the maintainer.
- Every eligible pending account is approved.
- The welcome campaign is sent once to every eligible existing account.
- Failed deliveries can be retried without resending successful deliveries.
- A fresh formerly-pending account can sign in and reach its library.
