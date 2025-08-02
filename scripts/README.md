# Sanity Types Sync Scripts

Scripts untuk mengambil file `sanity.types.ts` dan `schema.json` dari GitHub repository ke project frontend Anda.

## 📁 Files yang Tersedia

- `sync-sanity-types.js` - Script Node.js dengan CommonJS
- `sync-sanity-types.ts` - Script TypeScript 
- `fetch-sanity-types.mjs` - Script modern dengan ES modules dan fetch API
- `package.json` - Package configuration untuk scripts

## 🚀 Cara Penggunaan

### 1. Copy Script ke Frontend Project

Copy salah satu script ke project frontend Anda:

```bash
# Copy script yang diinginkan
cp sync-sanity-types.js /path/to/your/frontend/project/
# atau
cp sync-sanity-types.ts /path/to/your/frontend/project/
# atau  
cp fetch-sanity-types.mjs /path/to/your/frontend/project/
```

### 2. Jalankan Script

#### Menggunakan Node.js Script (CommonJS)
```bash
node sync-sanity-types.js
# atau dengan custom output directory
node sync-sanity-types.js --output-dir ./src/lib/sanity
```

#### Menggunakan TypeScript Script
```bash
# Install tsx jika belum ada
npm install -g tsx
# atau
npm install --save-dev tsx

# Jalankan script
npx tsx sync-sanity-types.ts
# atau dengan custom output directory
npx tsx sync-sanity-types.ts --output-dir ./src/lib/sanity
```

#### Menggunakan Modern ES Modules Script
```bash
node fetch-sanity-types.mjs
# atau dengan custom output directory
node fetch-sanity-types.mjs --output-dir ./src/lib/sanity
```

### 3. Tambahkan ke package.json Frontend

Tambahkan script ke `package.json` frontend project Anda:

```json
{
  "scripts": {
    "sync-sanity": "node sync-sanity-types.js",
    "sync-sanity:dev": "node sync-sanity-types.js --output-dir ./src/lib/sanity"
  }
}
```

## 📦 Output Files

Script akan membuat struktur folder seperti ini:

```
lib/sanity/          # atau directory yang Anda tentukan
├── sanity.types.ts  # TypeScript types dari Sanity
├── schema.json      # Schema JSON dari Sanity
└── index.ts         # Auto-generated index file
```

## 🔧 Configuration

Anda bisa mengubah konfigurasi di dalam script:

```javascript
// Configuration
const GITHUB_REPO = 'manikandareas/genii-studio';
const GITHUB_BRANCH = 'main'; // ubah jika branch berbeda
```

## 💡 Penggunaan di Frontend

Setelah sync, Anda bisa menggunakan types di frontend:

```typescript
// Import types
import { Course, Lesson, Chapter, Topic } from './lib/sanity';
// atau
import { Course, Lesson, Chapter, Topic } from './lib/sanity/sanity.types';

// Import schema
import schema from './lib/sanity/schema.json';

// Contoh penggunaan
const courses: Course[] = await sanityClient.fetch('*[_type == "course"]');
```

## 🔄 Automation

Untuk automation, Anda bisa:

### 1. GitHub Actions
```yaml
name: Sync Sanity Types
on:
  schedule:
    - cron: '0 */6 * * *' # Every 6 hours
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Sync Sanity Types
        run: node sync-sanity-types.js
      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add .
          git diff --staged --quiet || git commit -m "Update Sanity types"
          git push
```

### 2. Pre-build Hook
```json
{
  "scripts": {
    "prebuild": "node sync-sanity-types.js",
    "build": "next build"
  }
}
```

### 3. Development Watcher
```json
{
  "scripts": {
    "dev": "npm run sync-sanity && next dev",
    "dev:watch": "concurrently \"npm run sync-sanity\" \"next dev\""
  }
}
```

## ⚠️ Notes

1. Pastikan repository `manikandareas/genii-studio` adalah public atau Anda memiliki akses
2. File akan di-download dari branch `main` secara default
3. Script akan membuat directory output jika belum ada
4. File yang sudah ada akan di-overwrite
5. Pastikan internet connection tersedia saat menjalankan script

## 🐛 Troubleshooting

### Error: File not found
- Pastikan file `sanity.types.ts` dan `schema.json` ada di root repository
- Periksa nama branch (main vs master)

### Error: Permission denied
- Pastikan Anda memiliki permission untuk menulis ke output directory
- Jalankan dengan `sudo` jika diperlukan (tidak disarankan)

### Error: Network issues
- Periksa koneksi internet
- Coba lagi setelah beberapa saat
