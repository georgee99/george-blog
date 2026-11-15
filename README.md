# George's Blog
https://georgeelz.blog/

Simple and minimal. Nothing special about this, just for fun.

Update: The blog now contains AI 

## Admin area (`/admin`)

Private, single-administrator area using Auth.js (Google OAuth, JWT cookie sessions, 8h expiry). The public blog and `/api/ask` need no sign-in. Access is granted only to the Google account whose stable `sub` matches `ADMIN_GOOGLE_SUB`; with it unset, nobody is authorised. Every admin API handler must call `requireAdminApi()` from `src/lib/admin-auth.ts`.

Server-side environment variables (Vercel project settings / `.env.local`):

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Random secret for signing sessions (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client credentials |
| `ADMIN_GOOGLE_SUB` | Google account `sub` allowed to sign in |

In Google Cloud Console, add the authorised redirect URIs `https://georgeelz.blog/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. To find your `sub`, use the Google OAuth Playground and read the `sub` claim of the ID token.