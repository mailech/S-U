// Per-row KVK resolution. This data is superadmin-side: EVERY row carries its own "KVK Name"
// (e.g. "Kvk Rohtas", "Krishi Vigyan Kendra, Nawada", "RPCAU-KVK Saran"). We match each name to
// a kvkId. Exact normalized match first, then a conservative token-overlap fallback. Anything we
// can't confidently match is returned null so the UI can ask the user to pick the KVK.

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const toks = (s) => (String(s == null ? '' : s).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => !['kvk', 'krishi', 'vigyan', 'kendra', 'rpcau', 'the', 'of', 'and'].includes(t));

async function loadKvks(prisma) {
    const rows = await prisma.kvk.findMany({ orderBy: { kvkId: 'asc' } });
    return rows.map((k) => ({ kvkId: k.kvkId, kvkName: k.kvkName || k.name || ('KVK ' + k.kvkId) }));
}

// returns a matcher: (rawName) => { kvkId, kvkName, matched: 'exact'|'fuzzy'|null }
function buildMatcher(kvks) {
    const exact = new Map();
    kvks.forEach((k) => exact.set(norm(k.kvkName), k));
    return (rawName) => {
        const n = norm(rawName);
        if (!n) return { kvkId: null, kvkName: null, matched: null };
        if (exact.has(n)) { const k = exact.get(n); return { kvkId: k.kvkId, kvkName: k.kvkName, matched: 'exact' }; }
        // token-overlap fallback — only accept a clear, unambiguous winner
        const wt = toks(rawName);
        if (!wt.length) return { kvkId: null, kvkName: null, matched: null };
        let best = null, bestScore = 0, secondScore = 0;
        for (const k of kvks) {
            const kt = new Set(toks(k.kvkName));
            if (!kt.size) continue;
            let c = 0; for (const t of wt) if (kt.has(t)) c++;
            const score = c / Math.max(wt.length, kt.size);
            if (score > bestScore) { secondScore = bestScore; bestScore = score; best = k; }
            else if (score > secondScore) { secondScore = score; }
        }
        if (best && bestScore >= 0.6 && bestScore - secondScore >= 0.2) {
            return { kvkId: best.kvkId, kvkName: best.kvkName, matched: 'fuzzy' };
        }
        return { kvkId: null, kvkName: null, matched: null };
    };
}

module.exports = { loadKvks, buildMatcher, norm };
