// Single place the whole app gets its Prisma client from.
// Self-contained: uses this project's OWN bundled Prisma schema + client (prisma.js + prisma/),
// so it runs anywhere (Render, a friend's laptop) without the main backend next to it.
// The client carries the reporting-year bridge that fills year/reportingYearDate for the
// dual-year Natural-Farming models. It connects to whatever DATABASE_URL points at.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required — set it in .env (local) or in the host\'s environment variables.');
}

module.exports = require('./prisma.js');
