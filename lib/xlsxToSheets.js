// Convert a scraped .xlsx workbook (one sheet per form; row 1 = headers; rows below = data)
// into the same shape the engine consumes: { [sheetName]: { headers, rows } }, where each row
// is an object keyed by header text. Mirrors the scraper's JSON output so .xlsx and .json are
// interchangeable. (Copied from the main backend's import service.)
const ExcelJS = require('exceljs');

function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
        if (typeof v.text === 'string') return v.text;
        if ('result' in v) return v.result == null ? '' : String(v.result);
        if ('error' in v) return '';
        return String(v);
    }
    return String(v);
}

async function xlsxToSheets(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const out = {};
    for (const ws of wb.worksheets) {
        const headers = [];
        ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = cellText(cell.value).trim(); });
        const rows = [];
        for (let r = 2; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            const obj = {};
            let any = false;
            row.eachCell({ includeEmpty: true }, (cell, col) => {
                const h = headers[col];
                if (!h) return;
                const val = cellText(cell.value);
                obj[h] = val;
                if (val !== '') any = true;
            });
            if (any) rows.push(obj);
        }
        out[ws.name] = { headers: headers.filter(Boolean), rows };
    }
    return out;
}

module.exports = { xlsxToSheets, cellText };
