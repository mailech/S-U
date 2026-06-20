// Per-row-KVK import engine.
//
//   analyze({ prisma, data })  -> maps every supported sheet, resolves each row's KVK by name,
//                                 NO writes. Returns per-form rows (each tagged with its kvkId /
//                                 kvkName / match quality) + the KVK list (for unmatched dropdowns)
//                                 + any sheets we don't handle.
//   commit({ prisma, forms })  -> inserts the user-reviewed rows. Each row carries its own _kvkId.
//                                 Dedup-guarded; writes directly to Prisma (lenient bulk import).
//
// Unlike the per-KVK tool, there is NO single target kvkId — the KVK travels with each row.

const path = require('path');
const { buildForms } = require('./forms');

// Prisma DMMF (from the backend's generated client) lets us drop any stray UI-added column that
// isn't a real field on the model, so create() never throws "Unknown argument".
let PrismaDmmf = null;
try { PrismaDmmf = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', '@prisma', 'client')).Prisma; } catch (e) { /* standalone: wire up later */ }
function modelScalars(model) {
    if (!PrismaDmmf) return null;
    try {
        const name = model.charAt(0).toUpperCase() + model.slice(1);
        const m = PrismaDmmf.dmmf.datamodel.models.find((x) => x.name === name);
        if (!m) return { __missing: true };
        const s = new Set();
        for (const f of m.fields) if (f.kind === 'scalar' || f.kind === 'enum') s.add(f.name);
        return s;
    } catch (e) { return null; }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// after a JSON round-trip (analyze -> browser -> commit) Date values arrive as ISO strings;
// turn them back into Dates for both the insert payload and the dedup where-clause.
function deISO(v) { return (typeof v === 'string' && ISO.test(v)) ? new Date(v) : v; }

async function loadSeason(prisma) {
    const map = {};
    try { (await prisma.season.findMany()).forEach((s) => { map[String(s.seasonName).toLowerCase().trim()] = s.seasonId; }); } catch (e) { /* */ }
    return (name) => map[String(name || '').toLowerCase().trim()] || null;
}

function pickKvkName(row, kvkCols) {
    for (const c of kvkCols) { const v = row[c]; if (v != null && String(v).trim()) return String(v).trim(); }
    return '';
}

// strip meta + coerce ISO strings + drop non-real columns
function cleanRecord(model, raw) {
    const scalars = modelScalars(model);
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith('_')) continue;
        if (v === undefined) continue;
        if (scalars && scalars !== null && !scalars.__missing && !scalars.has(k)) continue; // not a real field
        out[k] = deISO(v);
    }
    return out;
}

// ---------- preview ----------
async function analyze({ prisma, data }) {
    const { loadKvks, buildMatcher } = require('./kvk');
    const kvks = await loadKvks(prisma);
    const match = buildMatcher(kvks);
    const season = await loadSeason(prisma);
    const FORMS = buildForms({ season });

    const present = new Set(Object.keys(data || {}).filter((s) => ((data[s] && data[s].rows) || []).length));
    const handled = new Set();
    const unmatched = new Map(); // normalizedName -> rawName (distinct)

    const forms = [];
    for (const f of FORMS) {
        handled.add(f.sheet);
        const rows = (data[f.sheet] && data[f.sheet].rows) || [];
        if (!rows.length) continue;
        const modelMissing = (() => { const s = modelScalars(f.model); return s && s.__missing; })();
        const out = { sheet: f.sheet, label: f.label, model: f.model, modelMissing, rows: [] };
        for (const r of rows) {
            const kvkName = pickKvkName(r, f.kvkCols);
            const m = match(kvkName);
            if (!m.kvkId && kvkName) unmatched.set(kvkName.toLowerCase(), kvkName);
            let rec;
            try { rec = f.map(r); } catch (e) { rec = { __error: e.message }; }
            const warnings = (f.warn && !rec.__error) ? (f.warn(r) || []) : [];
            out.rows.push({ data: rec, _kvkName: kvkName, _kvkId: m.kvkId, _match: m.matched, _matchedName: m.kvkName, _warnings: warnings });
        }
        out.matched = out.rows.filter((x) => x._kvkId).length;
        out.needsKvk = out.rows.filter((x) => !x._kvkId).length;
        forms.push(out);
    }

    const unmappedSheets = [...present].filter((s) => !handled.has(s));
    return {
        forms,
        kvks,
        unmatchedKvkNames: [...unmatched.values()],
        unmappedSheets,
        totals: {
            forms: forms.length,
            rows: forms.reduce((a, f) => a + f.rows.length, 0),
            rowsNeedingKvk: forms.reduce((a, f) => a + f.needsKvk, 0),
        },
    };
}

// ---------- commit ----------
async function commit({ prisma, forms }) {
    const season = await loadSeason(prisma);
    const FORMS = buildForms({ season });
    const bySheet = {};
    FORMS.forEach((f) => { bySheet[f.sheet] = f; });

    const inBySheet = {};
    for (const inf of (forms || [])) inBySheet[inf.sheet] = inf;

    const report = { forms: [], totals: { inserted: 0, skipped: 0, failed: 0, noKvk: 0 } };

    // iterate in catalogue order so the Agri-Drone intro is inserted before its demonstrations
    for (const f of FORMS) {
        const inf = inBySheet[f.sheet];
        if (!inf || !Array.isArray(inf.records) || !inf.records.length) continue;
        const res = { sheet: f.sheet, label: f.label, model: f.model, inserted: 0, skipped: 0, failed: 0, noKvk: 0, failures: [] };

        let i = 0;
        for (const rawRec of inf.records) {
            i++;
            const kvkId = Number(rawRec._kvkId);
            if (!kvkId) { res.noKvk++; continue; }
            try {
                const data = cleanRecord(f.model, rawRec);
                data.kvkId = kvkId;

                // Agri-Drone demonstrations need a parent intro record on the same KVK
                if (f.needsParentAgriDrone) {
                    const intro = await prisma.kvkAgriDrone.findFirst({ where: { kvkId } });
                    if (!intro) throw new Error('No Agri-Drone intro record for this KVK yet — import "Agri-Drone — Introduction" first');
                    data.agriDroneId = intro.id ?? intro.kvkAgriDroneId ?? intro.agriDroneId ?? intro.kvkAgriDroneIntroId;
                }

                // dedup
                const where = {};
                for (const [k, v] of Object.entries(f.key(data, kvkId))) where[k] = deISO(v);
                const ex = await prisma[f.model].findFirst({ where });
                if (ex) { res.skipped++; continue; }

                await prisma[f.model].create({ data });
                res.inserted++;
            } catch (e) {
                res.failed++;
                if (res.failures.length < 10) res.failures.push({ row: i, kvkId, reason: e.message });
            }
        }
        report.totals.inserted += res.inserted; report.totals.skipped += res.skipped;
        report.totals.failed += res.failed; report.totals.noKvk += res.noKvk;
        report.forms.push(res);
    }
    return report;
}

module.exports = { analyze, commit };
