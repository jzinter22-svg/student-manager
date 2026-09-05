-- Student Manager SaaS - Multi-Tenant PostgreSQL Schema
--
-- Every school-owned table carries a school_id foreign key to schools(id)
-- with ON DELETE CASCADE, so all student, staff, and academic data is
-- isolated per tenant and is removed automatically if a school is deleted.
-- All application queries against these tables must filter by school_id.

CREATE TABLE schools (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- Globally unique (not just per-school): login is performed by email
    -- alone with no school context supplied by the client, so the same
    -- email must not be able to resolve to accounts in two different
    -- schools -- that would make login ambiguous and is a tenant-isolation
    -- risk in itself.
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'teacher', 'staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-side sessions for authentication. The session identifier itself
-- is a random token handed to the client only inside an HttpOnly cookie;
-- only its SHA-256 hash is stored here, so a database leak alone does not
-- yield usable session tokens. Expired sessions are never treated as
-- valid (enforced by the application's expires_at > now() check).
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    student_code TEXT,
    date_of_birth DATE,
    gender TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULLs are not compared as equal by UNIQUE, so this allows any number
    -- of students without a student_code while enforcing uniqueness
    -- whenever a student_code is actually provided.
    UNIQUE (school_id, student_code)
);

CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT,
    specialization TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade_level TEXT,
    academic_year TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    -- One teacher can have many subjects, but every subject belongs to
    -- exactly one teacher (one-to-many, no junction table). NOT NULL with
    -- no ON DELETE SET NULL is deliberate: a subject without a teacher
    -- would violate that invariant, so deleting a teacher cascades to
    -- their subjects too -- consistent with this schema's existing
    -- convention of cascading deletes downward through ownership (see
    -- file header).
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, name)
);

CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,
    -- A transfer never deletes the old row: it sets started_at/ended_at on
    -- the row being left and inserts a fresh row (started_at = now(),
    -- ended_at = NULL) for the new class, so full history survives.
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforces the core Phase 8 rule at the database level: a student may
-- have at most one ACTIVE (ended_at IS NULL) enrollment per academic
-- year. A partial unique index, not a plain UNIQUE constraint, because
-- unlimited ENDED historical rows for the same (student_id,
-- academic_year) must remain allowed -- only the single currently-active
-- one is constrained. This replaces the old
-- UNIQUE (student_id, class_id, academic_year): that constraint is
-- insufficient for Phase 8's transfer model, since it would incorrectly
-- block a legitimate transfer back into a class a student previously
-- left within the same year (A -> B -> A), which the database would see
-- as a repeat of an existing (student_id, class_id, academic_year) row
-- from the first, now-ended, enrollment.
CREATE UNIQUE INDEX idx_enrollments_one_active_per_year
    ON enrollments (student_id, academic_year)
    WHERE ended_at IS NULL;

CREATE TABLE grades (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,
    assessment_type TEXT NOT NULL,
    score NUMERIC NOT NULL CHECK (score >= 0),
    max_score NUMERIC NOT NULL CHECK (max_score > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-filtering indexes: every school-owned table is queried by
-- school_id, so each one needs an index to keep those lookups fast.
CREATE INDEX idx_users_school_id ON users (school_id);
CREATE INDEX idx_students_school_id ON students (school_id);
CREATE INDEX idx_teachers_school_id ON teachers (school_id);
CREATE INDEX idx_classes_school_id ON classes (school_id);
CREATE INDEX idx_subjects_school_id ON subjects (school_id);
CREATE INDEX idx_subjects_teacher_id ON subjects (teacher_id);
CREATE INDEX idx_enrollments_school_id ON enrollments (school_id);
CREATE INDEX idx_enrollments_student_id ON enrollments (student_id);
CREATE INDEX idx_enrollments_class_id ON enrollments (class_id);
CREATE INDEX idx_grades_school_id ON grades (school_id);
CREATE INDEX idx_attendance_school_id ON attendance (school_id);
