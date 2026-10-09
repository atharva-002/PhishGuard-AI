# Connecting Gmail and Outlook

Pasting an e-mail or uploading a `.eml` file works with no setup. Connecting a live inbox needs a (free) OAuth app from Google and/or Microsoft, because only they can let PhishGuard read mail. Access is **read-only**.

Add these to `backend/.env` (see `backend/.env.example`), then restart the backend:

```
PUBLIC_BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
EMAIL_POLL_SECONDS=120      # optional: re-scan connected inboxes every 2 minutes
```

## Gmail (Google Cloud, ~10 minutes)

1. Go to <https://console.cloud.google.com/> and create a project (e.g. *PhishGuard*).
2. **APIs & Services → Library**, search **Gmail API**, click **Enable**.
3. **APIs & Services → OAuth consent screen**: user type *External*, fill in the app name and your e-mail. Under **Scopes** add `.../auth/gmail.readonly`. Under **Test users** add every Gmail address you will connect (while the app is in *Testing*, only these can sign in).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web application*.
   * Authorised redirect URI: `http://localhost:8000/api/email/gmail/callback`
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Google will show an "unverified app" warning during testing. Click *Continue*. That is normal for a project that hasn't been through Google's review.

## Outlook / Hotmail / Microsoft 365 (Azure, ~10 minutes)

1. Go to <https://portal.azure.com/> → **Microsoft Entra ID → App registrations → New registration**.
2. Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*.
3. Redirect URI: platform **Web**, `http://localhost:8000/api/email/outlook/callback`.
4. **Certificates & secrets → New client secret**. Copy the *Value* (not the ID) into `MS_CLIENT_SECRET`.
5. Copy **Application (client) ID** from the Overview page into `MS_CLIENT_ID`.
6. **API permissions → Add → Microsoft Graph → Delegated**: `Mail.Read`, `User.Read`, `offline_access`.

## Use it

Dashboard → **Email Scanner → Gmail / Outlook → Connect**, sign in, and you are sent back to the dashboard. Click **Scan inbox**, or set `EMAIL_POLL_SECONDS` to scan automatically. Results appear in the list and flagged mails show *why* (spoofed sender, failed DMARC, deceptive link, risky attachment, known scam link…).

Tokens are stored in your MongoDB (`email_accounts` collection). **Disconnect** deletes them.
