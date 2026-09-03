# Student Manager SaaS

Foundation of a multi-tenant school management application. Multiple
schools ("tenants") share one PostgreSQL database, and each school's data
is isolated by a `school_id` column.

## Multi-Tenant Architecture

Every school-owned table (`users`, `students`, `teachers`, `classes`,
`subjects`, `enrollments`, `grades`, `attendance`) has a `school_id`
foreign key referencing `schools(id)` with `ON DELETE CASCADE`, and every
query must filter by `school_id`. This keeps one school's students,
grades, and attendance records from ever being visible to another school.

**As of Phase 2, `DEV_SCHOOL_ID` is gone.** The `school_id` used for every
`/api/students` request now comes from the authenticated user's session —
never from the request body, query string, or headers. See
[Authentication](#authentication) below.

## Database

PostgreSQL, accessed directly through the `pg` package — no ORM.

Core tables (see `database.sql`): `schools`, `users`, `sessions`,
`students`, `teachers`, `classes`, `subjects`, `enrollments`, `grades`,
`attendance`. Key constraints: unique `schools.code`; unique `users.email`
(see [Authentication](#authentication) for why this is global, not
per-school); unique `(school_id, student_code)` on `students`; unique
`(school_id, name)` on `subjects`; unique
`(student_id, class_id, academic_year)` on `enrollments`; role/status
check constraints on `users.role` and `attendance.status`; and
`score >= 0` / `max_score > 0` on `grades`. Every school-owned table is
indexed on `school_id` for tenant-scoped lookups.

## Authentication

Server-side sessions, no external auth library or framework:

- **`POST /api/auth/register`** — `{ "school": { "name", "code" }, "user": { "name", "email", "password" } }`.
  Creates the school and its first user together in one database
  transaction (so a failure never leaves a school without an owner),
  hashes the password, and always assigns the new user the `owner` role.
  Rejects a duplicate school code or email, an invalid email, a password
  under 8 characters, or missing fields.
- **`POST /api/auth/login`** — `{ "email", "password" }`. Verifies the
  password hash and, on success, creates a session and sets it as an
  `HttpOnly` cookie. Wrong password and unknown email return the same
  `401 "Invalid email or password"` — the API never reveals whether an
  email is registered — and login runs the same password-verification
  work in both cases so the response time doesn't leak that either.
- **`GET /api/auth/me`** — returns the current session's user, `401` if
  not authenticated.
- **`POST /api/auth/logout`** — deletes the session server-side and
  clears the cookie.

**How `school_id` is derived (never trust the client for this):**

```
request cookie → session lookup (DB, not expired) → user row → user.school_id
```

`GET /api/students` and `POST /api/students` are wrapped in a
`requireAuth` middleware that runs this lookup and rejects the request
with `401` if it fails; the handlers then use `req.user.school_id`
exclusively. A `school_id` sent in the request body, query string, or a
header is simply never read for this purpose — there is no code path
that would let a client pick another school's data.

**Password hashing:** Node's built-in `crypto.scryptSync` with a random
16-byte salt per user (`scrypt:<salt>:<hash>` stored in
`users.password_hash`), verified with `crypto.timingSafeEqual`. This
avoids adding a native-compiled dependency (e.g. `bcrypt`) while using an
algorithm Node's own docs recommend for password storage. The hash is
never returned by any endpoint.

**Sessions:** a random 32-byte token is generated per login, HMAC-signed
with `SESSION_SECRET` for the cookie the client holds, and only its
SHA-256 hash is stored in the `sessions` table (`user_id`, `token_hash`,
`expires_at`). A request is authenticated only if the cookie's signature
is valid *and* the matching session row exists *and* `expires_at > now()`
— an expired or tampered/forged cookie is rejected. Cookie flags:
`HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production` (kept
off otherwise so local HTTP development still works). Sessions last 7
days and logout deletes the row immediately.

**Why `users.email` is globally unique, not per-school:** login takes
only an email and password, with no school specified — if the same email
could exist under two different schools, login would be ambiguous about
which account to authenticate. Each registration creates a brand-new
school with its own owner, so this doesn't restrict anything real users
would want yet; a later phase that lets an existing school invite
additional users will need to account for this.

**Authorization foundation (not fully used yet):** the authenticated
context carries `role` (`owner`/`admin`/`teacher`/`staff`), and a
`requireRole(...roles)` wrapper exists alongside `requireAuth` for
later phases to restrict specific endpoints by role. No endpoint uses it
yet in Phase 2.

Apply the schema with:

```
psql "$DATABASE_URL" -f database.sql
```

## Configuration

The server reads the connection string from `process.env.DATABASE_URL` —
never hard-code credentials. Copy `.env.example` to `.env` and fill in
real values locally; `.env` is git-ignored and must never be committed.

```
DATABASE_URL=postgresql://username:password@host:5432/student_manager
SESSION_SECRET=replace-with-a-long-random-string
```

`SESSION_SECRET` signs session cookies; if unset, the server generates a
random one at startup and logs a warning — fine for a single local dev
run, but every session is invalidated on restart and it must be set to a
stable value for any real deployment.

**Development vs. production connectivity:** in some sandboxed
environments (including this project's Claude Code Web session) outbound
network access is restricted to an allowlist that does not include
arbitrary database hosts, so a real remote `DATABASE_URL` (e.g. Neon,
Supabase) may be unreachable there even though the code is correct. The
schema and API logic should be verified against a reachable PostgreSQL
instance (local or an allowed host) before relying on a "connection
succeeded" result in such an environment.

## Student API

Both endpoints now require an authenticated session (see
[Authentication](#authentication)) and are scoped to the authenticated
user's school:

- `POST /api/students` — creates a student in the authenticated user's
  school. Requires a non-empty `name`; returns `201` with the created
  row, `401` if not authenticated, `400` for invalid JSON or a
  missing/blank name, `500` on a database or unexpected error.
- `GET /api/students` — returns students for the authenticated user's
  school only, `401` if not authenticated.

The existing minimal UI (`index.html`/`script.js`) has no login form yet,
so its "Add Student" button will now get a `401` until a login UI exists
in a future phase — that's the expected, correct effect of requiring
authentication.

## Phase 3 — Authentication UI & Application Shell

`index.html`/`script.js`/`style.css` are now a real, Arabic (`lang="ar"
dir="rtl"`), browser-based client for the Phase 2 backend — no framework,
no build step, same three files as before. `server.js` also now serves
them itself (`GET /`, `/script.js`, `/style.css`) so the page and the API
share one origin and the session cookie behaves normally.

- **Login screen** — بريد إلكتروني / كلمة مرور, `تسجيل الدخول`, and a link
  to `إنشاء مدرسة جديدة`.
- **Registration screen** — school name/code, admin name, email,
  password, and a client-side-only password confirmation field
  (`كلمة المرور` / `تأكيد كلمة المرور`); mismatched passwords are caught
  in the browser before any request is sent, with an Arabic message.
  Registration calls the existing `POST /api/auth/register`, then — since
  that endpoint doesn't itself start a session — immediately calls the
  existing `POST /api/auth/login` with the same credentials, so the owner
  lands straight in the app shell. This reuses the two existing endpoints
  as-is; it is not a new or second authentication mechanism.
- **Session detection** — on every load, the page calls `GET /api/auth/me`
  and shows the app shell only if that succeeds; a `401` shows the login
  screen. It never infers "logged in" from the mere presence of a cookie.
- **Application shell** — shows the user's name, email, role, and school
  name (from `/api/auth/me` / login's response), plus `إدارة الطلاب`: the
  existing student list (`GET /api/students`) and add-student form
  (`POST /api/students`), both calling the unmodified, session-scoped
  endpoints.
- **Logout** — `تسجيل الخروج` calls `POST /api/auth/logout`, which deletes
  the session server-side (not just a UI change); the old cookie stops
  authenticating immediately afterward.
- **Errors** — a small set of fixed Arabic messages for the cases the task
  specifies (bad login, registration failure, network failure, expired
  session), plus a few additional server messages (duplicate school code,
  duplicate email, weak password) translated to Arabic where recognized.
  Raw server/database detail is never shown — the backend already never
  returns any, and the frontend only reads `error`/`message` strings.
- **Loading states** — login, register, and add-student buttons disable
  and swap to a "جاري ..." label for the duration of their request, then
  restore.
- **Tenant security unchanged** — the frontend never reads, sends, or
  offers a `school_id` anywhere; every student request is scoped entirely
  by the session cookie on the backend, exactly as in Phase 2.

**Small Phase 2 backend additions (not a rewrite):** `authenticateRequest`,
the login query, and registration's response now also return
`school_name` (joined from `schools`), so the app shell has something
meaningful to show for "المدرسة" beyond a bare numeric `school_id` — the
authentication/session/tenant-isolation logic itself is unchanged.

Tested with real Chromium via Playwright (see the Phase 3 commit message
and project history for the full test list) covering the complete
register → shell → refresh → add student → logout → login-again →
two-school isolation lifecycle, plus the Arabic error/validation paths,
`localStorage`/`sessionStorage`/`document.cookie` being empty of any
auth data, and the session cookie's `HttpOnly` flag.
