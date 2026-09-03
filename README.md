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

Authentication does not exist yet. Until it does, `server.js` uses a
hard-coded `DEV_SCHOOL_ID` (clearly marked as a **TEMPORARY DEVELOPMENT
SCHOOL CONTEXT**) instead of deriving the school from a logged-in user.
The client can never choose its own `school_id`.

## Database

PostgreSQL, accessed directly through the `pg` package — no ORM.

Core tables (see `database.sql`): `schools`, `users`, `students`,
`teachers`, `classes`, `subjects`, `enrollments`, `grades`, `attendance`.
Key constraints: unique `schools.code`; unique `(school_id, email)` on
`users`; unique `(school_id, student_code)` on `students`; unique
`(school_id, name)` on `subjects`; unique
`(student_id, class_id, academic_year)` on `enrollments`; role/status
check constraints on `users.role` and `attendance.status`; and
`score >= 0` / `max_score > 0` on `grades`. Every school-owned table is
indexed on `school_id` for tenant-scoped lookups.

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
```

**Development vs. production connectivity:** in some sandboxed
environments (including this project's Claude Code Web session) outbound
network access is restricted to an allowlist that does not include
arbitrary database hosts, so a real remote `DATABASE_URL` (e.g. Neon,
Supabase) may be unreachable there even though the code is correct. The
schema and API logic should be verified against a reachable PostgreSQL
instance (local or an allowed host) before relying on a "connection
succeeded" result in such an environment.

## API

- `POST /api/students` — creates a student in the current (temporary
  dev) school. Requires a non-empty `name`; returns `201` with the
  created row, `400` for invalid JSON or a missing/blank name, `500` on
  a database or unexpected error.
- `GET /api/students` — returns students for the current (temporary dev)
  school only, always filtered by `school_id`.
