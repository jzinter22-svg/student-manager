const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.query('SELECT 1', (error) => {
    if (error) {
        console.log('Database connection failed');
    } else {
        console.log('Database connection succeeded');
    }
});

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/students') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Student received successfully'
                }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Invalid JSON'
                }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            message: 'Not found'
        }));
    }
});

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
