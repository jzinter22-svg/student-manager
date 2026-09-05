const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// ---------------------------------------------------------------------------
// Session secret
// ---------------------------------------------------------------------------
// Used to HMAC-sign the random session token stored in the client's cookie,
// so a tampered/forged cookie value is rejected before ever touching the
// database, and rotating this secret invalidates every existing session.
// It is never logged and never sent to the client.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
    console.warn(
        'SESSION_SECRET is not set. Using a randomly generated secret for this ' +
        'process only, so all sessions will be invalidated on restart. Set ' +
        'SESSION_SECRET in .env for a stable/production deployment.'
    );
}

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SCRYPT_KEYLEN = 64;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Small HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

// Unauthenticated, no-database liveness check for Render's health check --
// deliberately does nothing but confirm the process is up and serving HTTP.
async function handleHealth(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK');
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

async function parseJsonBody(req) {
    const body = await readRequestBody(req);
    if (!body) return {};
    return JSON.parse(body);
}

function parseCookies(req) {
    const header = req.headers.cookie;
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (key) cookies[key] = decodeURIComponent(value);
    });
    return cookies;
}

// ---------------------------------------------------------------------------
// Static frontend files
// ---------------------------------------------------------------------------
// Phase 1/2 never served the frontend over HTTP at all (every GET fell
// through to the JSON 404). A real browser session needs index.html served
// from the SAME origin as the API so that fetch('/api/...') and the
// HttpOnly session cookie work the ordinary same-origin way, with no CORS
// or manual cookie handling. This is a fixed allowlist of the three
// existing frontend files, not a general-purpose file server.
const STATIC_FILES = {
    '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
    '/script.js': { file: 'script.js', contentType: 'application/javascript; charset=utf-8' },
    '/style.css': { file: 'style.css', contentType: 'text/css; charset=utf-8' }
};

function serveStaticFile(entry, res) {
    fs.readFile(path.join(__dirname, entry.file), (error, content) => {
        if (error) {
            sendJson(res, 500, { success: false, error: 'Failed to load application file' });
            return;
        }
        res.writeHead(200, { 'Content-Type': entry.contentType });
        res.end(content);
    });
}

function buildCookieHeader(value, maxAgeSeconds) {
    const attrs = [
        `${SESSION_COOKIE_NAME}=${value}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`
    ];
    // Secure requires HTTPS; enable it once the app is actually served over
    // HTTPS in production so local HTTP development keeps working.
    if (process.env.NODE_ENV === 'production') {
        attrs.push('Secure');
    }
    return attrs.join('; ');
}

// ---------------------------------------------------------------------------
// Password hashing (Node's built-in crypto.scrypt -- no extra dependency)
// ---------------------------------------------------------------------------

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
    const parts = storedHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, hashHex] = parts;
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const storedBuffer = Buffer.from(hashHex, 'hex');
    if (storedBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(derivedKey, storedBuffer);
}

// A precomputed hash with no real user behind it, used to keep login's
// response time similar whether or not the email exists -- otherwise a
// missing user would skip scrypt entirely and be measurably faster,
// letting an attacker enumerate valid emails via timing.
const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-account-password');

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function signToken(token) {
    return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

// Cookie value is "<random token>.<HMAC signature of token>". The database
// only ever stores sha256(token), so neither the cookie contents nor the
// database contents alone are enough to authenticate as another user.
function buildSessionCookieValue(token) {
    return `${token}.${signToken(token)}`;
}

function verifyAndExtractToken(cookieValue) {
    const dotIndex = cookieValue.indexOf('.');
    if (dotIndex === -1) return null;
    const token = cookieValue.slice(0, dotIndex);
    const signature = cookieValue.slice(dotIndex + 1);
    const expectedSignature = signToken(token);
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (signatureBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
    return token;
}

async function createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await pool.query(
        'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, tokenHash, expiresAt]
    );
    return {
        cookieValue: buildSessionCookieValue(token),
        maxAgeSeconds: Math.floor(SESSION_DURATION_MS / 1000)
    };
}

async function destroySession(tokenHash) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

// Reads the session cookie (if any), validates its signature, and looks up
// the still-valid, non-expired session in the database together with the
// user it belongs to. This is the ONLY source of req.user.school_id -- the
// request body, query string, and headers are never trusted for it.
async function authenticateRequest(req) {
    const cookies = parseCookies(req);
    const cookieValue = cookies[SESSION_COOKIE_NAME];
    if (!cookieValue) return null;

    const token = verifyAndExtractToken(cookieValue);
    if (!token) return null;

    const tokenHash = sha256Hex(token);
    const result = await pool.query(
        `SELECT users.id, users.school_id, users.name, users.email, users.role, schools.name AS school_name,
                teachers.id AS linked_teacher_id
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         JOIN schools ON schools.id = users.school_id
         LEFT JOIN teachers ON teachers.user_id = users.id AND teachers.school_id = users.school_id
         WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
        [tokenHash]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        id: row.id,
        school_id: row.school_id,
        school_name: row.school_name,
        name: row.name,
        email: row.email,
        role: row.role,
        teacherId: row.linked_teacher_id,
        tokenHash
    };
}

// Wraps a handler so it only runs for an authenticated request, with
// req.user populated from the database-backed session lookup above.
function requireAuth(handler) {
    return async (req, res) => {
        const user = await authenticateRequest(req);
        if (!user) {
            sendJson(res, 401, { success: false, error: 'Authentication required' });
            return;
        }
        req.user = user;
        await handler(req, res);
    };
}

// Authorization foundation for later phases: wraps a handler so it only
// runs for an authenticated user whose role is in the allowed list.
function requireRole(...allowedRoles) {
    return function (handler) {
        return requireAuth(async (req, res) => {
            if (!allowedRoles.includes(req.user.role)) {
                sendJson(res, 403, { success: false, error: 'Insufficient permissions' });
                return;
            }
            await handler(req, res);
        });
    };
}

function safeUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        school_id: row.school_id,
        school_name: row.school_name,
        // Only present for a 'teacher'-role user with a linked teachers
        // row; used by the frontend to decide which subjects show
        // edit/delete controls for them. The API remains the real
        // authority regardless of what this value is.
        teacher_id: row.linked_teacher_id != null ? row.linked_teacher_id : null
    };
}

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

async function handleRegister(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const school = data.school && typeof data.school === 'object' ? data.school : {};
    const user = data.user && typeof data.user === 'object' ? data.user : {};

    const schoolName = typeof school.name === 'string' ? school.name.trim() : '';
    const schoolCode = typeof school.code === 'string' ? school.code.trim() : '';
    const userName = typeof user.name === 'string' ? user.name.trim() : '';
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const password = typeof user.password === 'string' ? user.password : '';

    if (!schoolName || !schoolCode || !userName || !email || !password) {
        sendJson(res, 400, {
            success: false,
            error: 'school.name, school.code, user.name, user.email, and user.password are all required'
        });
        return;
    }
    if (!EMAIL_REGEX.test(email)) {
        sendJson(res, 400, { success: false, error: 'Invalid email address' });
        return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        sendJson(res, 400, { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
    }

    // Hashed before the transaction starts; scrypt is deliberately slow, and
    // there's no reason to hold a database transaction open while it runs.
    const passwordHash = hashPassword(password);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const schoolResult = await client.query(
            'INSERT INTO schools (name, code) VALUES ($1, $2) RETURNING id',
            [schoolName, schoolCode]
        );
        const schoolId = schoolResult.rows[0].id;

        // The new user always becomes the owner of the school they just
        // registered -- role is never taken from client input.
        const userResult = await client.query(
            `INSERT INTO users (school_id, name, email, role, password_hash)
             VALUES ($1, $2, $3, 'owner', $4)
             RETURNING id, school_id, name, email, role`,
            [schoolId, userName, email, passwordHash]
        );

        await client.query('COMMIT');
        // schoolName is already known from validated input -- no extra query needed.
        sendJson(res, 201, { success: true, user: safeUser({ ...userResult.rows[0], school_name: schoolName }) });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            const message = error.constraint === 'schools_code_key'
                ? 'School code is already in use'
                : 'Email is already in use';
            sendJson(res, 400, { success: false, error: message });
        } else {
            console.error('Database error during registration:', error.message);
            sendJson(res, 500, { success: false, error: 'Registration failed' });
        }
    } finally {
        client.release();
    }
}

async function handleLogin(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';

    if (!email || !password) {
        sendJson(res, 400, { success: false, error: 'Email and password are required' });
        return;
    }

    try {
        const result = await pool.query(
            `SELECT users.id, users.school_id, users.name, users.email, users.role,
                    users.password_hash, schools.name AS school_name,
                    teachers.id AS linked_teacher_id
             FROM users
             JOIN schools ON schools.id = users.school_id
             LEFT JOIN teachers ON teachers.user_id = users.id AND teachers.school_id = users.school_id
             WHERE users.email = $1`,
            [email]
        );
        const userRow = result.rows[0] || null;

        // Always run password verification, even for an unknown email, using
        // a dummy hash so the response time doesn't leak whether the
        // account exists.
        const passwordOk = verifyPassword(password, userRow ? userRow.password_hash : DUMMY_PASSWORD_HASH);

        if (!userRow || !passwordOk) {
            sendJson(res, 401, { success: false, error: 'Invalid email or password' });
            return;
        }

        const { cookieValue, maxAgeSeconds } = await createSession(userRow.id);
        res.setHeader('Set-Cookie', buildCookieHeader(cookieValue, maxAgeSeconds));
        sendJson(res, 200, { success: true, user: safeUser(userRow) });
    } catch (error) {
        console.error('Database error during login:', error.message);
        sendJson(res, 500, { success: false, error: 'Login failed' });
    }
}

async function handleMe(req, res) {
    sendJson(res, 200, { success: true, user: safeUser(req.user) });
}

async function handleLogout(req, res) {
    try {
        await destroySession(req.user.tokenHash);
    } catch (error) {
        console.error('Database error during logout:', error.message);
    }
    res.setHeader('Set-Cookie', buildCookieHeader('', 0));
    sendJson(res, 200, { success: true, message: 'Logged out' });
}

// ---------------------------------------------------------------------------
// Student handlers (tenant-scoped via req.user.school_id -- never from the
// client-supplied request body, query string, or headers)
// ---------------------------------------------------------------------------

async function handleCreateStudent(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, message: 'Invalid JSON' });
        return;
    }

    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
        sendJson(res, 400, { success: false, message: 'Student name is required' });
        return;
    }

    const studentCode = typeof data.student_code === 'string' ? data.student_code : null;
    const dateOfBirth = typeof data.date_of_birth === 'string' ? data.date_of_birth : null;
    const gender = typeof data.gender === 'string' ? data.gender : null;
    const phone = typeof data.phone === 'string' ? data.phone : null;
    const address = typeof data.address === 'string' ? data.address : null;

    try {
        const result = await pool.query(
            `INSERT INTO students (school_id, name, student_code, date_of_birth, gender, phone, address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, school_id, name, student_code, date_of_birth, gender, phone, address, created_at`,
            [req.user.school_id, name, studentCode, dateOfBirth, gender, phone, address]
        );
        sendJson(res, 201, {
            success: true,
            message: 'Student created successfully',
            student: result.rows[0]
        });
    } catch (error) {
        console.error('Database error while creating student:', error.message);
        sendJson(res, 500, { success: false, message: 'Failed to create student' });
    }
}

async function handleListStudents(req, res) {
    try {
        const result = await pool.query(
            `SELECT id, school_id, name, student_code, date_of_birth, gender, phone, address, created_at
             FROM students
             WHERE school_id = $1
             ORDER BY id`,
            [req.user.school_id]
        );
        sendJson(res, 200, { success: true, students: result.rows });
    } catch (error) {
        console.error('Database error while listing students:', error.message);
        sendJson(res, 500, { success: false, message: 'Failed to fetch students' });
    }
}

// ---------------------------------------------------------------------------
// Teacher handlers (tenant-scoped via req.user.school_id, same rule as
// students: the client never supplies school_id in the body, query string,
// or URL. Create/update/delete are an administrative operation restricted
// to the owner/admin roles via requireRole; listing only requires being
// authenticated, matching the existing student GET endpoint's rule.)
// ---------------------------------------------------------------------------

function readTeacherFields(data) {
    return {
        name: typeof data.name === 'string' ? data.name.trim() : '',
        phone: typeof data.phone === 'string' ? data.phone.trim() : '',
        specialization: typeof data.specialization === 'string' ? data.specialization.trim() : ''
    };
}

async function handleListTeachers(req, res) {
    try {
        const result = await pool.query(
            `SELECT id, school_id, user_id, name, phone, specialization, created_at
             FROM teachers
             WHERE school_id = $1
             ORDER BY id DESC`,
            [req.user.school_id]
        );
        sendJson(res, 200, { success: true, teachers: result.rows });
    } catch (error) {
        console.error('Database error while listing teachers:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to fetch teachers' });
    }
}

async function handleCreateTeacher(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const { name, phone, specialization } = readTeacherFields(data);
    if (!name || !phone || !specialization) {
        sendJson(res, 400, { success: false, error: 'Name, phone, and specialization are all required' });
        return;
    }

    try {
        const result = await pool.query(
            `INSERT INTO teachers (school_id, name, phone, specialization)
             VALUES ($1, $2, $3, $4)
             RETURNING id, school_id, user_id, name, phone, specialization, created_at`,
            [req.user.school_id, name, phone, specialization]
        );
        sendJson(res, 201, { success: true, teacher: result.rows[0] });
    } catch (error) {
        console.error('Database error while creating teacher:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to create teacher' });
    }
}

async function handleUpdateTeacher(req, res) {
    const id = req.params.id;

    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const { name, phone, specialization } = readTeacherFields(data);
    if (!name || !phone || !specialization) {
        sendJson(res, 400, { success: false, error: 'Name, phone, and specialization are all required' });
        return;
    }

    try {
        // school_id in the WHERE clause (not just id) is what makes a
        // cross-tenant update impossible: a teacher belonging to another
        // school simply matches zero rows here, same as if it didn't exist.
        const result = await pool.query(
            `UPDATE teachers
             SET name = $1, phone = $2, specialization = $3
             WHERE id = $4 AND school_id = $5
             RETURNING id, school_id, user_id, name, phone, specialization, created_at`,
            [name, phone, specialization, id, req.user.school_id]
        );
        if (result.rows.length === 0) {
            sendJson(res, 404, { success: false, error: 'Teacher not found' });
            return;
        }
        sendJson(res, 200, { success: true, teacher: result.rows[0] });
    } catch (error) {
        console.error('Database error while updating teacher:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to update teacher' });
    }
}

async function handleDeleteTeacher(req, res) {
    const id = req.params.id;

    try {
        // Same tenant-scoping rule as update: id alone is never enough.
        const result = await pool.query(
            'DELETE FROM teachers WHERE id = $1 AND school_id = $2 RETURNING id',
            [id, req.user.school_id]
        );
        if (result.rows.length === 0) {
            sendJson(res, 404, { success: false, error: 'Teacher not found' });
            return;
        }
        sendJson(res, 200, { success: true, message: 'Teacher deleted successfully' });
    } catch (error) {
        console.error('Database error while deleting teacher:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to delete teacher' });
    }
}

// ---------------------------------------------------------------------------
// Class handlers (tenant-scoped via req.user.school_id, same rules as
// teachers: the client never supplies school_id; create/update/delete are
// owner/admin only via requireRole; listing only requires being
// authenticated. The existing classes table/columns are used as-is.)
// ---------------------------------------------------------------------------

function readClassFields(data) {
    return {
        name: typeof data.name === 'string' ? data.name.trim() : '',
        gradeLevel: typeof data.grade_level === 'string' ? data.grade_level.trim() : '',
        academicYear: typeof data.academic_year === 'string' ? data.academic_year.trim() : ''
    };
}

async function handleListClasses(req, res) {
    try {
        const result = await pool.query(
            `SELECT id, school_id, name, grade_level, academic_year, created_at
             FROM classes
             WHERE school_id = $1
             ORDER BY created_at DESC, id DESC`,
            [req.user.school_id]
        );
        sendJson(res, 200, { success: true, classes: result.rows });
    } catch (error) {
        console.error('Database error while listing classes:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to fetch classes' });
    }
}

async function handleCreateClass(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const { name, gradeLevel, academicYear } = readClassFields(data);
    if (!name || !gradeLevel || !academicYear) {
        sendJson(res, 400, { success: false, error: 'Name, grade level, and academic year are all required' });
        return;
    }

    try {
        const result = await pool.query(
            `INSERT INTO classes (school_id, name, grade_level, academic_year)
             VALUES ($1, $2, $3, $4)
             RETURNING id, school_id, name, grade_level, academic_year, created_at`,
            [req.user.school_id, name, gradeLevel, academicYear]
        );
        sendJson(res, 201, { success: true, class: result.rows[0] });
    } catch (error) {
        console.error('Database error while creating class:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to create class' });
    }
}

async function handleUpdateClass(req, res) {
    const id = req.params.id;

    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const { name, gradeLevel, academicYear } = readClassFields(data);
    if (!name || !gradeLevel || !academicYear) {
        sendJson(res, 400, { success: false, error: 'Name, grade level, and academic year are all required' });
        return;
    }

    try {
        // school_id in the WHERE clause is what makes a cross-tenant update
        // impossible: a class belonging to another school matches zero rows.
        const result = await pool.query(
            `UPDATE classes
             SET name = $1, grade_level = $2, academic_year = $3
             WHERE id = $4 AND school_id = $5
             RETURNING id, school_id, name, grade_level, academic_year, created_at`,
            [name, gradeLevel, academicYear, id, req.user.school_id]
        );
        if (result.rows.length === 0) {
            sendJson(res, 404, { success: false, error: 'Class not found' });
            return;
        }
        sendJson(res, 200, { success: true, class: result.rows[0] });
    } catch (error) {
        console.error('Database error while updating class:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to update class' });
    }
}

async function handleDeleteClass(req, res) {
    const id = req.params.id;

    try {
        // Same tenant-scoping rule as update. Any enrollments referencing
        // this class are removed by the database's own
        // ON DELETE CASCADE (enrollments.class_id) -- no application code
        // needed for that, and enrollment management is out of scope here.
        const result = await pool.query(
            'DELETE FROM classes WHERE id = $1 AND school_id = $2 RETURNING id',
            [id, req.user.school_id]
        );
        if (result.rows.length === 0) {
            sendJson(res, 404, { success: false, error: 'Class not found' });
            return;
        }
        sendJson(res, 200, { success: true, message: 'Class deleted successfully' });
    } catch (error) {
        console.error('Database error while deleting class:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to delete class' });
    }
}

// ---------------------------------------------------------------------------
// Subject handlers (tenant-scoped via req.user.school_id, plus a second
// layer of ownership scoping unique to this module: a subject always
// belongs to exactly one teacher (subjects.teacher_id, NOT NULL, one
// teacher -> many subjects, never the reverse). owner/admin can manage any
// subject in their school and may assign/reassign teacher_id, but only to
// a teacher verified to belong to that same school. A 'teacher'-role user
// can only create/update/delete subjects owned by their OWN linked teacher
// record (req.user.teacherId, resolved server-side from the session -- a
// client-supplied teacher_id is never trusted for this) and can never set
// or change teacher_id at all. Listing requires only authentication,
// matching every other module (staff included, read-only).
// ---------------------------------------------------------------------------

function readSubjectFields(data) {
    return {
        name: typeof data.name === 'string' ? data.name.trim() : '',
        code: typeof data.code === 'string' ? data.code.trim() : ''
    };
}

// Looks up one teacher by id, scoped to a school -- used both to validate
// an owner/admin-supplied teacher_id and to fetch a subject's teacher name.
async function findTeacherInSchool(teacherId, schoolId) {
    const result = await pool.query(
        'SELECT id, name FROM teachers WHERE id = $1 AND school_id = $2',
        [teacherId, schoolId]
    );
    return result.rows[0] || null;
}

async function attachTeacherName(subjectRow, schoolId) {
    const teacher = await findTeacherInSchool(subjectRow.teacher_id, schoolId);
    return { ...subjectRow, teacher_name: teacher ? teacher.name : null };
}

function parseTeacherId(rawValue) {
    const teacherId = Number(rawValue);
    return rawValue && Number.isInteger(teacherId) && teacherId > 0 ? teacherId : null;
}

async function handleListSubjects(req, res) {
    try {
        const result = await pool.query(
            `SELECT subjects.id, subjects.school_id, subjects.teacher_id, subjects.name, subjects.code,
                    subjects.created_at, teachers.name AS teacher_name
             FROM subjects
             JOIN teachers ON teachers.id = subjects.teacher_id
             WHERE subjects.school_id = $1
             ORDER BY subjects.created_at DESC, subjects.id DESC`,
            [req.user.school_id]
        );
        sendJson(res, 200, { success: true, subjects: result.rows });
    } catch (error) {
        console.error('Database error while listing subjects:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to fetch subjects' });
    }
}

async function handleCreateSubject(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const { name, code } = readSubjectFields(data);
    if (!name) {
        sendJson(res, 400, { success: false, error: 'Subject name is required' });
        return;
    }

    let teacherId;
    if (req.user.role === 'teacher') {
        // Ownership always comes from the authenticated user's own linked
        // teacher record -- any client-supplied teacher_id is ignored, not
        // merely overridden after the fact.
        if (!req.user.teacherId) {
            sendJson(res, 400, { success: false, error: 'No teacher record is linked to this account' });
            return;
        }
        teacherId = req.user.teacherId;
    } else {
        const requestedTeacherId = parseTeacherId(data.teacher_id);
        if (!requestedTeacherId) {
            sendJson(res, 400, { success: false, error: 'teacher_id is required' });
            return;
        }
        const teacher = await findTeacherInSchool(requestedTeacherId, req.user.school_id);
        if (!teacher) {
            sendJson(res, 400, { success: false, error: 'Teacher not found in this school' });
            return;
        }
        teacherId = teacher.id;
    }

    try {
        const result = await pool.query(
            `INSERT INTO subjects (school_id, teacher_id, name, code)
             VALUES ($1, $2, $3, $4)
             RETURNING id, school_id, teacher_id, name, code, created_at`,
            [req.user.school_id, teacherId, name, code || null]
        );
        sendJson(res, 201, { success: true, subject: await attachTeacherName(result.rows[0], req.user.school_id) });
    } catch (error) {
        if (error.code === '23505') {
            sendJson(res, 400, { success: false, error: 'Subject name is already in use in this school' });
            return;
        }
        console.error('Database error while creating subject:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to create subject' });
    }
}

async function handleUpdateSubject(req, res) {
    const id = req.params.id;

    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const { name, code } = readSubjectFields(data);
    if (!name) {
        sendJson(res, 400, { success: false, error: 'Subject name is required' });
        return;
    }

    try {
        if (req.user.role === 'teacher') {
            if (!req.user.teacherId) {
                sendJson(res, 400, { success: false, error: 'No teacher record is linked to this account' });
                return;
            }
            // teacher_id is deliberately absent from this query entirely --
            // a teacher can never reassign ownership, only edit name/code,
            // and only for a subject that is already theirs
            // (teacher_id = $5 in the WHERE clause, not the SET list).
            const result = await pool.query(
                `UPDATE subjects
                 SET name = $1, code = $2
                 WHERE id = $3 AND school_id = $4 AND teacher_id = $5
                 RETURNING id, school_id, teacher_id, name, code, created_at`,
                [name, code || null, id, req.user.school_id, req.user.teacherId]
            );
            if (result.rows.length === 0) {
                sendJson(res, 404, { success: false, error: 'Subject not found' });
                return;
            }
            sendJson(res, 200, { success: true, subject: await attachTeacherName(result.rows[0], req.user.school_id) });
            return;
        }

        // owner/admin: may also reassign teacher_id, validated against the
        // same school; omitting it leaves the subject's current teacher.
        let result;
        if (data.teacher_id !== undefined && data.teacher_id !== null && data.teacher_id !== '') {
            const requestedTeacherId = parseTeacherId(data.teacher_id);
            if (!requestedTeacherId) {
                sendJson(res, 400, { success: false, error: 'teacher_id is required' });
                return;
            }
            const teacher = await findTeacherInSchool(requestedTeacherId, req.user.school_id);
            if (!teacher) {
                sendJson(res, 400, { success: false, error: 'Teacher not found in this school' });
                return;
            }
            result = await pool.query(
                `UPDATE subjects
                 SET name = $1, code = $2, teacher_id = $3
                 WHERE id = $4 AND school_id = $5
                 RETURNING id, school_id, teacher_id, name, code, created_at`,
                [name, code || null, teacher.id, id, req.user.school_id]
            );
        } else {
            result = await pool.query(
                `UPDATE subjects
                 SET name = $1, code = $2
                 WHERE id = $3 AND school_id = $4
                 RETURNING id, school_id, teacher_id, name, code, created_at`,
                [name, code || null, id, req.user.school_id]
            );
        }

        if (result.rows.length === 0) {
            sendJson(res, 404, { success: false, error: 'Subject not found' });
            return;
        }
        sendJson(res, 200, { success: true, subject: await attachTeacherName(result.rows[0], req.user.school_id) });
    } catch (error) {
        if (error.code === '23505') {
            sendJson(res, 400, { success: false, error: 'Subject name is already in use in this school' });
            return;
        }
        console.error('Database error while updating subject:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to update subject' });
    }
}

async function handleDeleteSubject(req, res) {
    const id = req.params.id;

    try {
        let result;
        if (req.user.role === 'teacher') {
            if (!req.user.teacherId) {
                sendJson(res, 400, { success: false, error: 'No teacher record is linked to this account' });
                return;
            }
            result = await pool.query(
                'DELETE FROM subjects WHERE id = $1 AND school_id = $2 AND teacher_id = $3 RETURNING id',
                [id, req.user.school_id, req.user.teacherId]
            );
        } else {
            result = await pool.query(
                'DELETE FROM subjects WHERE id = $1 AND school_id = $2 RETURNING id',
                [id, req.user.school_id]
            );
        }
        if (result.rows.length === 0) {
            sendJson(res, 404, { success: false, error: 'Subject not found' });
            return;
        }
        sendJson(res, 200, { success: true, message: 'Subject deleted successfully' });
    } catch (error) {
        console.error('Database error while deleting subject:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to delete subject' });
    }
}

// ---------------------------------------------------------------------------
// Enrollment handlers (tenant-scoped via req.user.school_id). Read is
// available to every authenticated role (owner/admin/teacher/staff);
// create/transfer/end are owner/admin only via requireRole. academic_year
// is never accepted from the client -- it is always read from the
// selected class row, and the one-active-enrollment-per-year rule is
// enforced both here (a pre-check, for a clean error message) and by the
// database's partial unique index (idx_enrollments_one_active_per_year),
// which is what actually protects against a race between two concurrent
// requests.
// ---------------------------------------------------------------------------

function parsePositiveId(rawValue) {
    const id = Number(rawValue);
    return rawValue !== undefined && rawValue !== null && rawValue !== '' && Number.isInteger(id) && id > 0
        ? id
        : null;
}

async function findStudentInSchool(studentId, schoolId) {
    const result = await pool.query(
        'SELECT id, name, student_code FROM students WHERE id = $1 AND school_id = $2',
        [studentId, schoolId]
    );
    return result.rows[0] || null;
}

async function findClassInSchool(classId, schoolId) {
    const result = await pool.query(
        'SELECT id, name, grade_level, academic_year FROM classes WHERE id = $1 AND school_id = $2',
        [classId, schoolId]
    );
    return result.rows[0] || null;
}

async function handleListEnrollments(req, res) {
    try {
        const result = await pool.query(
            `SELECT enrollments.id, enrollments.student_id, students.name AS student_name,
                    students.student_code, enrollments.class_id, classes.name AS class_name,
                    classes.grade_level, enrollments.academic_year,
                    enrollments.started_at, enrollments.ended_at,
                    (enrollments.ended_at IS NULL) AS is_current
             FROM enrollments
             JOIN students ON students.id = enrollments.student_id
             JOIN classes ON classes.id = enrollments.class_id
             WHERE enrollments.school_id = $1
             ORDER BY enrollments.started_at DESC, enrollments.id DESC`,
            [req.user.school_id]
        );
        sendJson(res, 200, { success: true, enrollments: result.rows });
    } catch (error) {
        console.error('Database error while listing enrollments:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to fetch enrollments' });
    }
}

async function handleCreateEnrollment(req, res) {
    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const studentId = parsePositiveId(data.student_id);
    if (!studentId) {
        sendJson(res, 400, { success: false, error: 'student_id is required' });
        return;
    }
    const classId = parsePositiveId(data.class_id);
    if (!classId) {
        sendJson(res, 400, { success: false, error: 'class_id is required' });
        return;
    }

    const student = await findStudentInSchool(studentId, req.user.school_id);
    if (!student) {
        sendJson(res, 400, { success: false, error: 'Student not found in this school' });
        return;
    }
    // academic_year always comes from the class row, never from the
    // client -- a client-supplied academic_year in the body is simply
    // never read.
    const targetClass = await findClassInSchool(classId, req.user.school_id);
    if (!targetClass) {
        sendJson(res, 400, { success: false, error: 'Class not found in this school' });
        return;
    }

    try {
        const activeResult = await pool.query(
            'SELECT id FROM enrollments WHERE student_id = $1 AND academic_year = $2 AND ended_at IS NULL',
            [studentId, targetClass.academic_year]
        );
        if (activeResult.rows.length > 0) {
            sendJson(res, 400, {
                success: false,
                error: 'Student already has an active enrollment for this academic year'
            });
            return;
        }

        const result = await pool.query(
            `INSERT INTO enrollments (school_id, student_id, class_id, academic_year)
             VALUES ($1, $2, $3, $4)
             RETURNING id, student_id, class_id, academic_year, started_at, ended_at`,
            [req.user.school_id, studentId, classId, targetClass.academic_year]
        );
        const enrollment = result.rows[0];
        sendJson(res, 201, {
            success: true,
            enrollment: {
                ...enrollment,
                student_name: student.name,
                student_code: student.student_code,
                class_name: targetClass.name,
                grade_level: targetClass.grade_level,
                is_current: enrollment.ended_at === null
            }
        });
    } catch (error) {
        // The pre-check above handles the normal case; this is the
        // database's own partial unique index catching a genuine race
        // between two near-simultaneous requests -- never surfaced as a
        // raw constraint-violation error.
        if (error.code === '23505') {
            sendJson(res, 400, {
                success: false,
                error: 'Student already has an active enrollment for this academic year'
            });
            return;
        }
        console.error('Database error while creating enrollment:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to create enrollment' });
    }
}

async function handleTransferEnrollment(req, res) {
    const enrollmentId = req.params.id;

    let data;
    try {
        data = await parseJsonBody(req);
    } catch (error) {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' });
        return;
    }

    const newClassId = parsePositiveId(data.class_id);
    if (!newClassId) {
        sendJson(res, 400, { success: false, error: 'class_id is required' });
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // FOR UPDATE: a second, near-simultaneous transfer/end of the same
        // enrollment blocks here until this transaction commits, rather
        // than both racing to read ended_at = NULL.
        const currentResult = await client.query(
            `SELECT id, student_id, class_id, academic_year, ended_at
             FROM enrollments
             WHERE id = $1 AND school_id = $2
             FOR UPDATE`,
            [enrollmentId, req.user.school_id]
        );
        const current = currentResult.rows[0];
        if (!current) {
            await client.query('ROLLBACK');
            sendJson(res, 404, { success: false, error: 'Enrollment not found' });
            return;
        }
        if (current.ended_at !== null) {
            await client.query('ROLLBACK');
            sendJson(res, 400, { success: false, error: 'Enrollment is already ended' });
            return;
        }
        if (current.class_id === newClassId) {
            await client.query('ROLLBACK');
            sendJson(res, 400, { success: false, error: 'Cannot transfer to the same class' });
            return;
        }

        const targetClass = await findClassInSchool(newClassId, req.user.school_id);
        if (!targetClass) {
            await client.query('ROLLBACK');
            sendJson(res, 400, { success: false, error: 'Class not found in this school' });
            return;
        }
        // A normal transfer moves a student within the same academic
        // year; a target class from a different year is out of scope for
        // this phase and is rejected rather than silently honored.
        if (targetClass.academic_year !== current.academic_year) {
            await client.query('ROLLBACK');
            sendJson(res, 400, { success: false, error: 'Cannot transfer to a class in a different academic year' });
            return;
        }

        // Order matters: end the old row first, then insert the new one,
        // both inside this transaction -- by the time the INSERT runs,
        // the partial unique index no longer sees the old row as active,
        // so the new row can become the sole active one without a
        // moment where two active rows (or zero) exist to any other
        // reader, and without tripping the very constraint that's meant
        // to protect this invariant.
        await client.query('UPDATE enrollments SET ended_at = now() WHERE id = $1', [current.id]);

        const insertResult = await client.query(
            `INSERT INTO enrollments (school_id, student_id, class_id, academic_year)
             VALUES ($1, $2, $3, $4)
             RETURNING id, student_id, class_id, academic_year, started_at, ended_at`,
            [req.user.school_id, current.student_id, targetClass.id, current.academic_year]
        );

        await client.query('COMMIT');

        const student = await findStudentInSchool(current.student_id, req.user.school_id);
        const newEnrollment = insertResult.rows[0];
        sendJson(res, 200, {
            success: true,
            enrollment: {
                ...newEnrollment,
                student_name: student ? student.name : null,
                student_code: student ? student.student_code : null,
                class_name: targetClass.name,
                grade_level: targetClass.grade_level,
                is_current: true
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            sendJson(res, 400, {
                success: false,
                error: 'Student already has an active enrollment for this academic year'
            });
            return;
        }
        console.error('Database error while transferring enrollment:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to transfer student' });
    } finally {
        client.release();
    }
}

async function handleEndEnrollment(req, res) {
    const enrollmentId = req.params.id;

    try {
        const result = await pool.query(
            `UPDATE enrollments
             SET ended_at = now()
             WHERE id = $1 AND school_id = $2 AND ended_at IS NULL
             RETURNING id, student_id, class_id, academic_year, started_at, ended_at`,
            [enrollmentId, req.user.school_id]
        );
        if (result.rows.length === 0) {
            // Distinguish "doesn't exist in this tenant" (404) from
            // "exists but already ended" (400) without an extra query
            // leaking whether it exists in a DIFFERENT tenant -- this
            // second lookup is itself still scoped by school_id.
            const existsResult = await pool.query(
                'SELECT id FROM enrollments WHERE id = $1 AND school_id = $2',
                [enrollmentId, req.user.school_id]
            );
            if (existsResult.rows.length === 0) {
                sendJson(res, 404, { success: false, error: 'Enrollment not found' });
                return;
            }
            sendJson(res, 400, { success: false, error: 'Enrollment is already ended' });
            return;
        }
        sendJson(res, 200, { success: true, enrollment: result.rows[0] });
    } catch (error) {
        console.error('Database error while ending enrollment:', error.message);
        sendJson(res, 500, { success: false, error: 'Failed to end enrollment' });
    }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const routes = {
    'GET /health': handleHealth,
    'POST /api/auth/register': handleRegister,
    'POST /api/auth/login': handleLogin,
    'GET /api/auth/me': requireAuth(handleMe),
    'POST /api/auth/logout': requireAuth(handleLogout),
    'GET /api/students': requireAuth(handleListStudents),
    'POST /api/students': requireAuth(handleCreateStudent),
    'GET /api/teachers': requireAuth(handleListTeachers),
    'POST /api/teachers': requireRole('owner', 'admin')(handleCreateTeacher),
    'GET /api/classes': requireAuth(handleListClasses),
    'POST /api/classes': requireRole('owner', 'admin')(handleCreateClass),
    'GET /api/subjects': requireAuth(handleListSubjects),
    // Staff is excluded here; owner/admin/teacher all reach the handler,
    // which then enforces the finer-grained ownership rule itself (a
    // teacher may only affect their own subjects) -- requireRole alone
    // can't express that, only the coarse role gate.
    'POST /api/subjects': requireRole('owner', 'admin', 'teacher')(handleCreateSubject),
    'GET /api/enrollments': requireAuth(handleListEnrollments),
    'POST /api/enrollments': requireRole('owner', 'admin')(handleCreateEnrollment)
};

// Routes needing a URL parameter (currently /api/teachers/:id and
// /api/classes/:id for PATCH/DELETE) get one small table of dedicated
// regex matches rather than a general path-matching system.
const ID_ROUTES = [
    {
        pattern: /^\/api\/teachers\/(\d+)$/,
        PATCH: requireRole('owner', 'admin')(handleUpdateTeacher),
        DELETE: requireRole('owner', 'admin')(handleDeleteTeacher)
    },
    {
        pattern: /^\/api\/classes\/(\d+)$/,
        PATCH: requireRole('owner', 'admin')(handleUpdateClass),
        DELETE: requireRole('owner', 'admin')(handleDeleteClass)
    },
    {
        pattern: /^\/api\/subjects\/(\d+)$/,
        PATCH: requireRole('owner', 'admin', 'teacher')(handleUpdateSubject),
        DELETE: requireRole('owner', 'admin', 'teacher')(handleDeleteSubject)
    },
    // These two are POST to an action sub-path rather than PATCH/DELETE on
    // the resource itself, but the same {pattern, METHOD: handler} table
    // and dispatch loop handle that with no changes needed below.
    {
        pattern: /^\/api\/enrollments\/(\d+)\/transfer$/,
        POST: requireRole('owner', 'admin')(handleTransferEnrollment)
    },
    {
        pattern: /^\/api\/enrollments\/(\d+)\/end$/,
        POST: requireRole('owner', 'admin')(handleEndEnrollment)
    }
];

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && STATIC_FILES[req.url]) {
        serveStaticFile(STATIC_FILES[req.url], res);
        return;
    }

    let handler = routes[`${req.method} ${req.url}`];

    if (!handler) {
        for (const route of ID_ROUTES) {
            const match = route.pattern.exec(req.url);
            const idHandler = match && route[req.method];
            if (idHandler) {
                req.params = { id: match[1] };
                handler = idHandler;
                break;
            }
        }
    }

    if (!handler) {
        sendJson(res, 404, { success: false, error: 'Not found' });
        return;
    }

    handler(req, res).catch(error => {
        console.error('Unexpected server error:', error.message);
        sendJson(res, 500, { success: false, error: 'Internal server error' });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
