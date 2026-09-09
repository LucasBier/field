# Nia's X connection

Field connects one operator-owned X account using OAuth 2.0 Authorization Code with
PKCE (S256). Website visitors cannot connect or replace Nia's account. This module
connects and verifies the account; publication is handled separately by the reviewed public studio, not by account connection.

## Configuration

Enable a confidential Web App / Automated App / Bot in the X console. Set its
website to the production origin and its exact callback to
`https://your-domain/api/social/x/callback`.

Set sensitive production environment variables `FIELD_X_CLIENT_ID`,
`FIELD_X_CLIENT_SECRET`, `FIELD_X_OWNER_KEY`, `FIELD_X_ENCRYPTION_KEY` and configure
`FIELD_X_USER_ID` (the expected numeric account ID) and `FIELD_X_ORIGIN` (the exact
HTTPS origin, without a trailing slash). Generate separate 32-byte random values,
encoded as 64 lowercase hexadecimal characters, for the owner and encryption keys.
Store the owner key in the operator's password manager, not browser local storage.
Do not expose any secret in frontend environment variables or Git.

Apply `0002_x_connection.sql` to the production database, then deploy. Open
`/admin/social`, enter the owner key, select Connect X, and authorize the expected
account. Check connection reads only local metadata; Verify with X performs a
billable `GET /2/users/me`. API credentials must belong to a funded X application.

## Security and persistence

The start endpoint requires the owner credential and an exact matching Origin.
A ten-minute, single-use state is bound to a Secure HttpOnly SameSite=Lax host-only
cookie. State and browser bindings are hashed; PKCE verifiers and OAuth tokens are
AES-256-GCM encrypted with versioned, purpose-specific authenticated data. The
callback consumes state atomically before exchanging the code, verifies granted
scopes, and checks the numeric account ID before saving anything. No credentials
are returned to the browser. Connection records are separate from visitor memory.

Refresh tokens rotate under a database revision check and an exclusive lease.
Requests do not blindly retry refreshes. An uncertain refresh or persistence
failure leaves the connection locked and requires reauthorization. A new verified
connection supersedes the old revision, so an older refresh cannot overwrite it.

`POST /api/social/x` supports `status`, `connect`, `verify`, and `disconnect`.
All actions require `Authorization: Bearer <owner-key>` and the configured Origin.
Disconnect deletes local credentials and pending authorizations; revoke the grant
in X's Connected apps settings to remove access at X as well. Rotating the
application encryption key requires reconnecting the account. The public callback
only accepts an authorization initiated by the owner in the same browser.

## Boundaries

Requested scopes are `tweet.read users.read tweet.write media.write offline.access`.
Having write permission does not enable autonomous publication. The public studio
uses a reviewed outbox, atomic publication claims, exact duplicate protection and
a six-post UTC daily limit. Its local worker can draft but cannot authorize publication. Private visitor conversations must never become
material for Nia's public account. X API credits do not pay for model inference.
