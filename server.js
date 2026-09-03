const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// TEMPORARY DEVELOPMENT SCHOOL CONTEXT
// This is NOT the final authentication architecture. There is no login
// system yet, so every request is treated as belonging to this fixed
// school until the authentication layer exists. Once authentication is
// added, the school context must be derived from the authenticated user
// instead of a hard-coded value, and the client must never be able to
// choose which school's data it accesses.
const DEV_SCHOOL_ID = 1;

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
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

async function handleCreateStudent(req, res) {
    let data;
    try {
        const body = await readRequestBody(req);
        data = JSON.parse(body);
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
            [DEV_SCHOOL_ID, name, studentCode, dateOfBirth, gender, phone, address]
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
            [DEV_SCHOOL_ID]
        );
        sendJson(res, 200, { success: true, students: result.rows });
    } catch (error) {
        console.error('Database error while listing students:', error.message);
        sendJson(res, 500, { success: false, message: 'Failed to fetch students' });
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/students') {
        handleCreateStudent(req, res).catch(error => {
            console.error('Unexpected server error:', error.message);
            sendJson(res, 500, { success: false, message: 'Internal server error' });
        });
    } else if (req.method === 'GET' && req.url === '/api/students') {
        handleListStudents(req, res).catch(error => {
            console.error('Unexpected server error:', error.message);
            sendJson(res, 500, { success: false, message: 'Internal server error' });
        });
    } else {
        sendJson(res, 404, { success: false, message: 'Not found' });
    }
});

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
