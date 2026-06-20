// No-DB, no-write sanity check: for every form in the catalogue, confirm the target model exists
// in the Prisma schema and that every field our map() emits is a REAL column on that model.
// Catches typos/wrong field names before we ever touch a database.
//
//   node scripts/validate-mappings.js
const path = require('path');
const { Prisma } = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', '@prisma', 'client'));
const { buildForms } = require('../lib/forms');

function scalars(model) {
    const name = model.charAt(0).toUpperCase() + model.slice(1);
    const m = Prisma.dmmf.datamodel.models.find((x) => x.name === name);
    if (!m) return null;
    const s = new Set();
    for (const f of m.fields) if (f.kind === 'scalar' || f.kind === 'enum') s.add(f.name);
    return s;
}

// a representative row touching every column our maps read
const SAMPLE = {
    'KVK Name': 'KVK Purnea', 'KVK': 'KVK Purnea', 'Start Date': '2024-04-01', 'End Date': '2025-03-31',
    'Year': '2024', 'Reporting Year': '2024-25', 'Crop': 'Wheat', 'Variety': 'HD-2967', 'Quantity in (q)': '12',
    'Revenue': '50000', 'Total': '50000', 'Name of farm implement/equipment': 'Rotavator', 'No. of farmers used Implement': '8',
    'Area covered': '4', 'Farm Implement used (In Hours)': '20', 'Revenue generated (Rs.)': '8000', 'Expenditure incurred on repairing (Rs.)': '500',
    'Village name': 'Rampur', 'VCRMC Constitution date': '2023-06-01', 'VCRMC members (no.)': '15', 'Meetings organized by VCRMC (no.)': '4',
    'Date of VCRMC meeting': '2024-07-01', 'Name of Secretary': 'Ram Kumar', 'No. of soil samples collected': '100', 'No. of samples analysed': '90',
    'SHC issued': '85', 'No. of farmers benefitted': '80', 'Development Scheme/Programme': 'MGNREGA', 'Nature of work': 'Pond', 'Amount (Rs.)': '200000',
    'VIP/Experts': 'VIP', 'Name': 'Dr. A Singh', 'Date of visited': '2024-08-01', 'PI/CO PI': 'PI',
    'Name of the programme': 'Field Day', 'Date of the programme': '2024-09-01', 'Venue': 'KVK', 'Purpose': 'Awareness', 'No. of participants': '60',
    'Agro Climatic Zone': 'Zone III', 'Farming Situation of the Selected Farmer': 'Irrigated', 'Latitude (N)': '25.7', 'Longitude (E)': '87.4',
    'Activity Name': 'Training', 'Title of Natural Farming training Programme': 'NF Basics', 'Date of Training': '2024-05-01', 'Venue of programme': 'Hall', 'Participants': '40',
    'Farmer Name': 'Sita Devi', 'Name of Activity': 'Demo', 'Address': 'Vill Rampur', 'Normal crops grown': 'Rice', 'Practicing year of natural farming': '2020',
    'Number of block': '3', 'Number of village': '10', 'Number of training': '5', 'No. of farmers influenced to adopt Natural Farming': '120',
    'Season': 'Kharif', 'Type': 'Irrigated', 'Before pH': '7.1', 'Before EC (dS/m)': '0.4', 'Before EC OC (%)': '0.5', 'After pH': '7.3', 'After EC (dS/m)': '0.45', 'After EC OC (%)': '0.6',
    'Number of activity organised': '4', 'Budget sanction (Rs)': '100000', 'Budget expenditure (Rs)': '90000', 'Total Budget Expenditure (Rs)': '90000',
    'Project implementing centre name': 'KVK Purnea', 'Company of Drone': 'IoTechWorld', 'Model of Drone': 'Agribot', 'No. of Agri Drones Sanctioned': '2', 'No. of Agri Drones Purchased': '1', 'Amount sanctioned (Rs)': '500000',
    'Project Implementing Centre Name': 'KVK Purnea', 'District': 'Purnea', 'Date of Demons.': '2024-10-01', 'Place of demons.': 'Field', 'Crop Name': 'Maize', 'No. of demos': '3', 'Area covered under demos.': '5', 'No of farmers': '25',
    'Crop Name ': 'Maize', 'Area (ha)': '5', 'Yield (ha)': '20',
};

const forms = buildForms({ season: () => 1 });
let problems = 0;
for (const f of forms) {
    const sc = scalars(f.model);
    if (!sc) { console.log(`✗ ${f.sheet}: model "${f.model}" NOT FOUND in schema`); problems++; continue; }
    let rec;
    try { rec = f.map(SAMPLE); } catch (e) { console.log(`✗ ${f.sheet}: map() threw: ${e.message}`); problems++; continue; }
    const allowExtra = new Set(['kvkId', 'agriDroneId']);
    const bad = Object.keys(rec).filter((k) => !k.startsWith('_') && !allowExtra.has(k) && !sc.has(k));
    if (bad.length) { console.log(`✗ ${f.sheet} (${f.model}): unknown field(s): ${bad.join(', ')}`); problems++; }
    else { console.log(`✓ ${f.sheet} → ${f.model} (${Object.keys(rec).length} fields ok)`); }
}
console.log(problems ? `\n${problems} form(s) need fixing.` : `\nAll ${forms.length} forms map to real columns.`);
process.exit(problems ? 1 : 0);
