/** නමෝ බුද්ධාය | 🤍 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (['node_modules', 'dist', '.git', 'screenshots'].includes(entry.name)) continue;
        const name = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(name);
        else if (name.endsWith('.js')) files.push(name);
    }
}

walk(root);
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
}
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const used = [...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
const missing = [...new Set(used.filter(id => !ids.includes(id)))];
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (missing.length || duplicates.length) throw new Error(JSON.stringify({missing, duplicates}));
if (/@import|https?:\/\//.test(fs.readFileSync(path.join(root, 'public/style.css'), 'utf8'))) throw new Error('The UI must not require external styles or fonts.');
console.log(`Checked ${files.length} JavaScript files and ${ids.length} unique DOM IDs. Offline assets verified.`);
