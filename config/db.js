// Single place the whole app gets its Prisma client from.
//
// DEV (now): we reuse the MAIN backend's already-generated Prisma client — which carries the
// reporting-year bridge that auto-fills year/reportingYearDate for the dual-year Natural-Farming
// models (BeneficiariesDetails, SoilDataInformation, FinancialInformation). We bind it to THIS
// app's own DATABASE_URL by loading our .env BEFORE requiring the backend client (dotenv never
// overrides an already-set var, and the backend client reads process.env.DATABASE_URL at require).
//
// STANDALONE deploy (later, when this gets its own git repo): copy backend/config/prisma.js and
// the backend/prisma/ schema folder into this project, `npm i @prisma/client pg @prisma/adapter-pg`,
// run `prisma generate`, and change the require below to './prisma.js'. Nothing else changes.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required — copy .env.example to .env and point it at a TEST database.');
}

const BACKEND_PRISMA = path.join(__dirname, '..', '..', 'backend', 'config', 'prisma.js');
module.exports = require(BACKEND_PRISMA);
