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

## Phase 4 — Core Application Dashboard & Navigation Shell

The flat authenticated screen from Phase 3 is now a real dashboard shell:
a persistent header, a sidebar navigation (an off-canvas drawer on
tablet/mobile, `≤768px`), and a main content area that swaps between
views client-side — still `index.html`/`script.js`/`style.css`, no
router library, no framework. **Zero backend or database changes** were
needed for this phase; every number and list shown is real data from the
existing, unmodified `GET /api/students`.

- **Header** — `Student Manager` / `نظام إدارة الطلاب`, the authenticated
  user's name, role, and school name (from the same `/api/auth/me` /
  login response as before), and `تسجيل الخروج`, which still calls the
  one existing `POST /api/auth/logout` — no second logout path.
- **Sidebar navigation** — `الرئيسية` (dashboard) and `الطلاب` (students)
  are functional; `المعلمون`, `الصفوف`, `المواد`, `الحضور`, `الدرجات` are
  placeholders that show "هذه الوحدة ستكون متاحة في مرحلة لاحقة." and
  nothing else — no fake CRUD UI. The active item is marked both visually
  and with `aria-current="page"`.
- **Dashboard** — a welcome line built from the authenticated user's real
  name/school, a real `إجمالي الطلاب` count derived from the length of
  the array `GET /api/students` returns (no separate stats endpoint), a
  small quick-actions block (`إضافة طالب` / `عرض الطلاب`, both just
  navigate to the Students view), and an `أحدث الطلاب` list of the 5
  most-recently-created real students. Correct empty states
  ("لا يوجد طلاب حديثون.") replace fake placeholder rows when a school has
  no students yet.
- **Students module** — the existing add-student form and
  `GET`/`POST /api/students` integration from Phase 3, now showing each
  student's `student_code` when the backend returns one, plus a
  client-side-only `البحث عن طالب` field that filters the already-loaded
  list by name/code — no new search endpoint.
- **Data consistency, not redundant requests** — the student list is
  fetched once when the app shell opens (feeding the dashboard count,
  the recent list, and the students list all at once) and re-fetched
  only after a student is actually added; switching between Dashboard
  and Students never re-fetches. Logging out and back in as a different
  user resets this cached data immediately, so a new session never
  briefly shows the previous session's list.
- **Responsive** — tested at 375px, 768px, 1024px, and a wider desktop
  width; the sidebar becomes a slide-in drawer (with a dismissable
  backdrop and Escape-to-close) below 768px, and no view produces
  horizontal page overflow at any of them.
- **Authentication/session/tenant isolation unchanged** — `GET
  /api/auth/me` is still the only source of truth for being logged in,
  refresh and logout behave exactly as in Phase 3, and the frontend still
  never reads, stores, or sends a `school_id` anywhere; every dashboard
  number and list is scoped entirely by the backend session, re-verified
  in this phase with a full two-school regression test through the real
  dashboard UI.

Tested with real Chromium via Playwright: the full
register → dashboard → students → add student → dashboard count updates
→ refresh → logout → login-again → two-school isolation lifecycle, every
placeholder nav item, the client-side search filter, the mobile drawer
(open/close/backdrop/auto-close-on-navigate), and no horizontal overflow
at 375/768/1024px — 39 assertions, all passing.

## Phase 5 — Teachers Management

`المعلمون` is no longer a placeholder — it's a real CRUD module, using the
existing `teachers` table (`id`, `school_id`, `user_id`, `name`, `phone`,
`specialization`, `created_at`) unchanged and the existing
`requireAuth`/`requireRole` mechanisms unchanged. No schema changes, no
new dependencies.

**API** (all tenant-scoped by `req.user.school_id`, never by anything the
client sends):

- `GET /api/teachers` — any authenticated role; returns the school's
  teachers, newest first.
- `POST /api/teachers` — **owner/admin only** (`403` otherwise); requires
  non-empty `name`, `phone`, and `specialization`. `user_id` is left
  `NULL` — creating a teacher never creates a login account for them.
- `PATCH /api/teachers/:id` — **owner/admin only**; same three fields
  required. The query is `WHERE id = $1 AND school_id = $2`, so a teacher
  belonging to another school simply matches zero rows — same `404` as a
  teacher that doesn't exist at all, never a `200` and never a `403` that
  would confirm another tenant's record exists.
- `DELETE /api/teachers/:id` — **owner/admin only**; same tenant-scoped
  `WHERE id = $1 AND school_id = $2` rule.

`teacher`/`staff` roles can `GET` (read) but get `403 Forbidden` from
`POST`/`PATCH`/`DELETE` — this mirrors the task's "teacher management is
an administrative operation" rule while keeping listing available to
everyone at the school, consistent with how `GET /api/students` already
works for every role.

`/api/teachers/:id` is the one route needing a URL parameter; it's
matched with one small dedicated regex in `server.js` rather than
building a general path-router for a single case.

**Frontend** — same `index.html`/`script.js`/`style.css`, same dashboard
shell, no new files: an "إضافة معلم"-toggled form (also reused for
editing, with its title/button text and prefilled values swapped), a
list showing name/phone/specialization with تعديل/حذف actions, a native
`confirm()` before delete, and a client-side search filtering the
already-loaded list by name/phone/specialization (no new search
endpoint). The add/edit/delete action controls are hidden in the UI for
`teacher`/`staff` roles — purely a UX nicety, since the API enforces the
real restriction regardless of what the UI shows.

**Bug fixed in the process:** `.app-shell` and `.view` (both introduced
in Phase 4) set `display: flex` as an author rule, which — per the CSS
cascade — always outranks the browser's built-in `[hidden] {
display: none }` regardless of selector specificity, since author-origin
declarations beat user-agent-origin ones outright. In practice this meant
every `hidden`-toggled screen/view carrying one of those classes (the
authenticated app shell itself, and every dashboard/students/teachers/
placeholder view) stayed visually rendered and stacked underneath
whichever view *was* meant to be showing, even though the `hidden`
attribute was being toggled correctly in the DOM the whole time. It went
undetected through Phases 3–4 because those tests asserted the expected
screen/view *was* visible via `:not([hidden])`-based waits, never that
the others actually weren't. Fixed with two explicit `.app-shell[hidden]`
/ `.view[hidden] { display: none; }` overrides (higher specificity than
the base class, so they win outright) — verified directly before and
after the fix, and covered going forward by this phase's Playwright
suite, which does assert on real visibility.

Tested with real Chromium via Playwright (38 assertions) plus curl for
the parts a browser can't easily drive (role accounts other than
`owner`, which only registration can create — `admin`/`teacher`/`staff`
test accounts were inserted directly with the same `scrypt` hash format
the app itself uses): unauthenticated `401` on both `GET`/`POST`;
owner and admin can create/read/update/delete; `teacher` and `staff` get
`403` on create/update/delete but `200` on read; missing/whitespace-only
name, phone, or specialization all rejected with `400` (checked on both
ends); a SQL-injection-shaped name is stored as inert literal text, not
executed; full create → edit → delete lifecycle through the real UI,
including the confirm-dialog-cancel-doesn't-delete path; newest-first
ordering; client-side search by name/phone/specialization; no horizontal
overflow at 375/768/1024px; a two-school regression (School A/Teacher A,
School B/Teacher B) confirming School A can neither read, update
(`404`), nor delete (`404`) School B's teacher, from both curl and the
real dashboard UI; and a full Phase 1–4 regression (register, login,
student creation, dashboard count, session refresh, logout) alongside
the new module.

## Phase 6 — Classes Management

`الصفوف` is now a real CRUD module, structured identically to
[Phase 5's Teachers module](#phase-5--teachers-management) — same
`requireAuth`/`requireRole` reuse, same tenant-scoping pattern, same UI
conventions (the class list even reuses the Teachers module's
`.teacher-item`/`.teacher-info`/`.teacher-actions` CSS classes, since the
shape — name, a secondary meta line, edit/delete actions — is identical,
so no new CSS was needed). No schema changes: the existing `classes`
table (`id`, `school_id`, `name`, `grade_level`, `academic_year`,
`created_at`) is used exactly as-is.

**API** (all tenant-scoped by `req.user.school_id`):

- `GET /api/classes` — any authenticated role; returns the school's
  classes, ordered `created_at DESC, id DESC` (newest first).
- `POST /api/classes` — **owner/admin only**; requires non-empty `name`,
  `grade_level`, and `academic_year`.
- `PATCH /api/classes/:id` — **owner/admin only**; same three fields
  required; `WHERE id = $1 AND school_id = $2` makes a class belonging to
  another school resolve to `404`, identically to the Teachers module.
- `DELETE /api/classes/:id` — **owner/admin only**; same tenant-scoped
  `WHERE` clause. Deleting a class cascades to its `enrollments` rows via
  the existing `ON DELETE CASCADE` on `enrollments.class_id` — no
  application code needed for that, and enrollment management itself is
  out of scope for this phase.

`teacher`/`staff` can read but get `403` from `POST`/`PATCH`/`DELETE`,
same rule as teachers. The two-entry `ID_ROUTES` table in `server.js`
(added this phase) replaces what was a single hard-coded
`/api/teachers/:id` regex, so `/api/teachers/:id` and `/api/classes/:id`
share one small dispatch loop instead of duplicating the same
match-and-dispatch logic per resource.

**Frontend** — same add/edit-toggle form pattern as Teachers (`+ إضافة
صف`, `إضافة صف` vs `تعديل الصف`, `حفظ`/`إلغاء`), a native `confirm()`
before delete naming the class, and a client-side search over
name/grade level/academic year. Add/edit/delete controls are hidden in
the UI for `teacher`/`staff` (a UX layer only — the API is the real
enforcement); those roles still see the read-only list.

Tested with real Chromium via Playwright (39 assertions) plus curl for
role accounts other than `owner`: unauthenticated `401` on `GET`/`POST`;
all four roles get `200` on read; owner/admin get `201`/`200` on
create/update/delete while `teacher`/`staff` get `403`; missing or
whitespace-only `name`/`grade_level`/`academic_year` all rejected `400`
on the backend; a SQL-injection-shaped name stored as inert text;
newest-first ordering confirmed; full create → search → edit → delete
lifecycle through the real UI including confirm-dialog-cancel-doesn't-
delete; no horizontal overflow at 375/768/1024px; role-based UI hiding
for `teacher` (read-only) vs `admin` (full access); and the mandatory
two-school regression — School A/Class A and School B/Class B — verified
in **both directions** at the API level (School A gets `404` trying to
update or delete School B's class and vice versa) and through the real
UI (each owner sees only their own school's classes). A full Phase 1–5
regression (registration, login, student creation, teacher creation,
dashboard count, session refresh, mobile drawer, logout) passed
alongside the new module.

## Phase 7 — Subjects Management

`المواد` is now a real CRUD module with a relationship the earlier
modules don't have: **every subject belongs to exactly one teacher, and
one teacher can have many subjects** — a plain one-to-many via
`subjects.teacher_id`, not a many-to-many junction table. Subject names
are always typed by the user; there is no predefined catalog anywhere in
the code.

**Schema change:** `subjects.teacher_id INTEGER NOT NULL REFERENCES
teachers(id) ON DELETE CASCADE` (plus `idx_subjects_teacher_id`). This
was a direct schema addition, not a live migration — no code path before
this phase ever inserted a subject row (`المواد` was a placeholder
through Phase 1–6), so there were no existing records to preserve,
backfill, or risk orphaning. `ON DELETE CASCADE` was chosen (not `SET
NULL`, which isn't possible on a `NOT NULL` column anyway, and not
`RESTRICT`) because a subject without a teacher would violate the
required invariant — deleting a teacher must take their subjects with
it, consistent with this schema's existing convention of cascading
deletes downward through ownership.

**A small necessary auth enrichment:** `authenticateRequest` and the
login query now `LEFT JOIN teachers ON teachers.user_id = users.id AND
teachers.school_id = users.school_id`, and `safeUser()` exposes the
result as `teacher_id` (`null` for non-teacher roles or a teacher-role
user with no linked record). This mirrors how `school_name` was added in
Phase 3 — the frontend needs it to decide which subjects show edit/delete
controls for a teacher-role user. It changes nothing about how
authentication or sessions work, and the API remains the sole
enforcement point regardless of what this value is.

**API** (all tenant-scoped by `req.user.school_id`; `GET` additionally
joins `teachers` so the response already carries `teacher_name` — no
per-subject follow-up request):

- `GET /api/subjects` — any authenticated role; ordered `created_at DESC,
  id DESC`.
- `POST /api/subjects` — owner/admin/teacher (staff gets `403` at the
  route gate). Requires a non-empty `name`. For **owner/admin**,
  `teacher_id` is required and is verified with `SELECT id FROM teachers
  WHERE id = $1 AND school_id = $2` before the insert — a teacher from
  another school, or a missing one, is rejected with `400`. For
  **teacher**, `teacher_id` is never read from the request at all;
  `req.user.teacherId` (resolved server-side above) is used instead, so a
  forged `teacher_id` in the body is silently ignored, not merely
  overridden after validation. A teacher-role user with no linked
  `teachers` row gets a clear `400` and keeps read access.
- `PATCH /api/subjects/:id` — same role gate. Owner/admin can change
  `name`/`code`/`teacher_id` (the new teacher validated the same way as
  create) on any subject in their school. A teacher can change only
  `name`/`code`, only on a subject where `teacher_id` already equals
  their own (`WHERE id = $1 AND school_id = $2 AND teacher_id = $3`), and
  `teacher_id` is absent from the `SET` list entirely for that branch —
  there is no code path where a teacher's request could reassign
  ownership, forged or not.
- `DELETE /api/subjects/:id` — same role gate and the same
  owner/admin-any-subject vs. teacher-own-subject-only split as `PATCH`.
- `subjects.name` stays `UNIQUE (school_id, name)` (Phase 1's original
  constraint, unchanged) — a duplicate is rejected with a clear message,
  and the same name is free to reuse in a different school.

**Frontend** — same add/edit-toggle pattern as Teachers/Classes. For
owner/admin, the `المعلم` `<select>` is populated from the already-used
`GET /api/teachers` data (lazy-loaded if not already fetched) — never a
hardcoded list. For a teacher-role user, the selector is hidden entirely
and replaced with a one-line note that the subject will be assigned to
them automatically; the actual assignment happens server-side regardless
of anything the page does. Each subject's edit/delete buttons render only
when `canManageSubject()` — true for owner/admin always, true for a
teacher only when the subject's `teacher_id` matches their own
(`state.user.teacher_id`, the value from the auth enrichment above) —
this is a UX layer only, since the API enforces the real rule
independently.

Tested with real Chromium via Playwright (37 assertions) plus curl for
scenarios a single browser session can't easily set up (multiple
teacher-role accounts linked to different `teachers` rows, which only a
direct DB insert can create since registration only ever creates an
owner): unauthenticated `401` on `GET`; all four roles get `200` on read;
owner/admin/teacher can create while staff gets `403`; a forged
`teacher_id` from a teacher-role request is provably ignored (the subject
lands under the authenticated teacher, not the forged one) on both create
and update; a teacher gets `404` (not `403`) attempting to
read-by-ID-via-update, update, or delete another teacher's subject, and
that other subject is verified unchanged afterward; an unlinked
teacher-role account gets a clear error on write but keeps read access;
owner/admin can legitimately reassign a subject's teacher within the
school and are rejected assigning one from another school; duplicate
names rejected within a school, the same name accepted in a different
school; a SQL-injection-shaped name stored as inert text; `ON DELETE
CASCADE` verified directly (deleting a teacher with subjects removes
those subjects, leaving no orphans); the full add → search → edit →
delete lifecycle through the real UI, including the dynamic teacher
dropdown, the auto-assignment note for teacher-role users, and
per-subject ownership-based button visibility (verified against two
different teacher accounts in the same school); no horizontal overflow
at 375/768/1024px; the mandatory two-school regression, both at the API
level (cross-school `GET`/`PATCH`/`DELETE` all correctly blocked) and
through the real UI; and a full Phase 1–6 regression (registration,
login, student/teacher/class creation, dashboard, session refresh,
logout) passed alongside the new module.

## Phase 8 — Student Enrollment Management

`تسجيل الطلاب` is a new sidebar module (there was no placeholder for it —
it's added fresh) tying students to classes over time, with full
transfer history. The relationship stays `Student → Enrollment → Class`;
there is deliberately no `students.class_id` — a student's current class
is always *derived* from their active enrollment row.

**Schema change:** `enrollments` gains `started_at`/`ended_at
TIMESTAMPTZ`, and the old `UNIQUE (student_id, class_id, academic_year)`
constraint is **replaced** by a partial unique index:

```sql
CREATE UNIQUE INDEX idx_enrollments_one_active_per_year
    ON enrollments (student_id, academic_year)
    WHERE ended_at IS NULL;
```

This is the core Phase 8 invariant enforced by PostgreSQL itself, not
just application code: **a student may have at most one active
(`ended_at IS NULL`) enrollment per academic year.** The old constraint
was insufficient (and actively wrong) for the transfer model this phase
needs: it would have blocked a student transferring back into a class
they'd previously left in the same year (A → B → A), since that exact
`(student_id, class_id, academic_year)` triple already exists from the
first, now-ended, enrollment row. A transfer never deletes anything — it
sets `ended_at = now()` on the row being left and inserts a fresh row
(`started_at = now()`, `ended_at = NULL`) for the new class, inside one
transaction, so full history always survives. Also added:
`idx_enrollments_student_id`, `idx_enrollments_class_id` (`school_id`
was already indexed).

**Migration safety:** this was a direct schema addition, not a live-data
migration — like every table added in earlier phases, no code path
before this phase ever inserted an `enrollments` row (`تسجيل الطلاب` did
not exist at all before now), so there was nothing to conflict with. The
required pre-migration check —

```sql
SELECT student_id, academic_year, count(*)
FROM enrollments
WHERE ended_at IS NULL
GROUP BY student_id, academic_year
HAVING count(*) > 1;
```

— was run against a copy of this schema before adding the index and
returned zero rows, confirming no existing data could violate the new
constraint. An operator applying this to a real, already-populated
database (e.g. one seeded outside this application) should run that same
query first and resolve any conflicts before applying the migration.

**API** (all tenant-scoped by `req.user.school_id`; view is available to
every authenticated role, mutations are owner/admin only):

- `GET /api/enrollments` — any role; joins `students`/`classes` so every
  row already carries `student_name`, `student_code`, `class_name`,
  `grade_level`, plus `is_current` (`ended_at IS NULL`) — no per-row
  follow-up request. Ordered `started_at DESC, id DESC`.
- `POST /api/enrollments` — owner/admin; body is just `{student_id,
  class_id}`. `academic_year` is never read from the client — it's
  always the selected class's own `academic_year` column, after
  verifying both the student and the class belong to
  `req.user.school_id`. Rejects a duplicate active enrollment for that
  student/year with a clear message *and* relies on the database's
  partial unique index as the real protection against a race between two
  near-simultaneous requests (caught as Postgres error `23505`, never
  surfaced raw).
- `POST /api/enrollments/:id/transfer` — owner/admin; body is
  `{class_id}` (the new class). Runs in one transaction with `SELECT ...
  FOR UPDATE` on the current enrollment row (so a second concurrent
  transfer/end of the same enrollment blocks rather than races): rejects
  transferring an enrollment that's already ended, transferring to the
  same class, a target class outside the school, or a target class in a
  *different* academic year (out of scope for this phase); otherwise ends
  the old row and inserts the new one before committing — the order
  matters, since it's what lets the new row become active without
  tripping the very constraint meant to protect that invariant.
- `POST /api/enrollments/:id/end` — owner/admin; sets `ended_at = now()`
  on an active enrollment. Never deletes the row. Ending an
  already-ended enrollment returns a clear `400`, not a silent no-op or a
  `404` that would obscure the distinction from "doesn't exist here."

Cross-tenant `transfer`/`end` resolve to `404` (never `403`, consistent
with every other module) rather than confirming another school's
enrollment exists.

**Frontend** — same visual language as Teachers/Classes/Subjects (the
enrollment list reuses those modules' `.teacher-item` layout classes plus
two new small ones, `.status-badge`/`.status-current`/`.status-ended`,
for the حالي/منتهي indicator). The add form's student and class
`<select>`s are populated from the already-loaded Students/Classes module
data — no new fetches, no hardcoded names or years. Selecting a student
who already has a current enrollment shows a warning naming their
current class/year with a one-click shortcut straight into the transfer
form, so the normal add flow can't produce a duplicate (the backend
still rejects one regardless, with the exact required Arabic message).
"View a student's history" is handled by reusing the existing search box
rather than a separate view: a `عرض سجل الطالب` action on any row fills
the search with that student's name, and the already-current-plus-
historical list filters down to just their timeline. The academic-year
filter's options come from the distinct years actually present in the
loaded enrollments, never a hardcoded list. Transfer and end both
require a native `confirm()`, matching the delete-confirmation pattern
used elsewhere; end and transfer controls are shown only for a *current*
enrollment and only to owner/admin — the API enforces the real
restriction regardless of what the UI shows.

Tested with real Chromium via Playwright (42 assertions) plus curl for
the direct-database bypass and concurrency-adjacent checks a browser
can't drive: unauthenticated `401`; all four roles read; owner/admin
create/transfer/end while teacher/staff get `403` (teacher retains full
read access, verified separately); missing/non-existent/cross-tenant
student or class all rejected `400`; a forged `academic_year` in the
request body is provably ignored (the real class year is what's stored);
duplicate active enrollment rejected by the API *and*, bypassing the API
entirely with a direct `INSERT`, rejected by the database's partial
unique index itself; the full transfer lifecycle (old row ended, new row
active, exactly one active row, complete history preserved) including
the specific **A → B → A** case the schema change exists to support;
transfer rejected for an already-ended enrollment, the same class, a
cross-tenant class, a nonexistent class, and a different academic year;
end rejected on an already-ended enrollment (`400`, row still present,
not deleted) and confirmed still visible in history afterward; the
mandatory two-school regression — cross-tenant `GET`/`transfer`/`end` all
correctly blocked (`404`), verified from curl and the real UI in both
directions; a SQL-injection-shaped non-numeric id rejected as plain
invalid input; the full create → duplicate-warning → transfer → history
→ end lifecycle through the real UI; the academic-year filter and search;
no horizontal overflow at 375/768/1024px; and a full Phase 1–7 regression
(registration, login, students, classes, subjects, dashboard, session
refresh, logout) passed alongside the new module.

## Render Deployment

The app is a single Node.js process (`server.js`) serving both the API and
the static frontend, so it deploys as one Render Web Service with no
separate frontend build/host.

**Build command:**
```
npm install
```

**Start command:**
```
npm start
```

**Health check path:**
```
/health
```
Returns `200 OK` with no authentication and no database access, suitable
for Render's health check probe.

**Required environment variables** (set in the Render service's
Environment tab, never committed to the repo):
- `DATABASE_URL` — connection string for the production PostgreSQL
  instance (e.g. a Render PostgreSQL or external Postgres provider).
- `SESSION_SECRET` — a long random string used to sign session cookies.
  If unset, the server generates a random secret on each boot (fine for
  local development, but it invalidates all sessions on every restart —
  always set this in production).

**Recommended:**
- `NODE_ENV=production` — enables the `Secure` attribute on the session
  cookie (in addition to the `HttpOnly`/`SameSite=Lax` attributes it
  always has), which requires the app to be served over HTTPS. Render
  terminates TLS and serves every Web Service over HTTPS, so this is
  safe to set.

The server binds to `process.env.PORT` (falling back to `3000` when
unset), which is what Render requires — it assigns the port a Web
Service must listen on via that same environment variable.
