
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYODIDE_VERSION = 'v0.29.0';
const BASE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const DEST_DIR = path.join(__dirname, '../public/pyodide');
const PACKAGES_TO_INSTALL = ['sympy', 'matplotlib', 'micropip', 'docutils'];

// Core files always needed
const CORE_FILES = [
    'pyodide.js',
    'pyodide.asm.js',
    'pyodide.asm.wasm',
    'pyodide-lock.json',
    'package.json',
    'python_stdlib.zip'
];

async function downloadFile(filename) {
    const url = BASE_URL + filename;
    const destPath = path.join(DEST_DIR, filename);

    if (await fs.pathExists(destPath)) {
        console.log(`  [SKIP] ${filename} (already exists)`);
        return;
    }

    console.log(`  [DOWN] ${filename}...`);

    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
                return;
            }
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath).catch(() => { });
            reject(err);
        });
    });
}

async function main() {
    console.log(`🚀 Starting Pyodide ${PYODIDE_VERSION} downloader...`);
    await fs.ensureDir(DEST_DIR);

    // 1. Download Core Files
    console.log('📦 Downloading Core Files...');
    for (const file of CORE_FILES) {
        await downloadFile(file);
    }

    // 2. Fetch lock file to resolve dependencies
    console.log('🔍 resolving dependencies...');
    const lockData = await fetch(BASE_URL + 'pyodide-lock.json').then(r => r.json());

    const filesToDownload = new Set();
    const queue = [...PACKAGES_TO_INSTALL];
    const processed = new Set();

    while (queue.length > 0) {
        const pkgName = queue.shift();
        if (processed.has(pkgName)) continue;
        processed.add(pkgName);

        const checkName = pkgName.toLowerCase();
        const pkgInfo = lockData.packages[pkgName] || Object.values(lockData.packages).find(p => p.name === checkName);

        if (!pkgInfo) {
            console.warn(`  [WARN] Package ${pkgName} not found in lock file.`);
            continue;
        }

        filesToDownload.add(pkgInfo.file_name);

        if (pkgInfo.depends) {
            pkgInfo.depends.forEach(dep => {
                if (!processed.has(dep)) queue.push(dep);
            });
        }
    }

    // 3. Download Package Files
    console.log(`📦 Downloading ${filesToDownload.size} package files...`);
    for (const file of filesToDownload) {
        await downloadFile(file);
    }

    console.log('\n✅ Pyodide downloaded successfully to public/pyodide/');
}

main().catch(console.error);
