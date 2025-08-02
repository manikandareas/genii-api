#!/usr/bin/env node

/**
 * Modern ES modules version using fetch API
 * Usage: node fetch-sanity-types.mjs [--output-dir ./lib/sanity]
 */

import fs from 'node:fs';
import path from 'node:path';

// Configuration
const GITHUB_REPO = 'manikandareas/genii-studio';
const GITHUB_BRANCH = 'main';

const FILES_TO_SYNC = [
  {
    path: 'sanity.types.ts',
    outputName: 'sanity.types.ts',
  },
  {
    path: 'schema.json',
    outputName: 'schema.json',
  },
];

// Parse command line arguments
const args = process.argv.slice(2);
const outputDirIndex = args.indexOf('--output-dir');
const outputDir =
  outputDirIndex !== -1 && args[outputDirIndex + 1]
    ? args[outputDirIndex + 1]
    : './lib/sanity';

/**
 * Download file using fetch API
 */
async function downloadFile(url, outputPath) {
  console.log(`📥 Downloading: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${url}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`✅ Saved: ${outputPath}`);

    return outputPath;
  } catch (error) {
    throw new Error(`Failed to download ${url}: ${error.message}`);
  }
}

/**
 * Main sync function
 */
async function syncSanityTypes() {
  console.log('🚀 Starting Sanity types sync...');
  console.log(`📁 Output directory: ${outputDir}`);
  console.log(`📦 Repository: ${GITHUB_REPO}`);
  console.log(`🌿 Branch: ${GITHUB_BRANCH}`);
  console.log('');

  try {
    const downloadPromises = FILES_TO_SYNC.map((file) => {
      const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${file.path}`;
      const outputPath = path.join(outputDir, file.outputName);
      return downloadFile(url, outputPath);
    });

    await Promise.all(downloadPromises);

    console.log('');
    console.log('🎉 Sync completed successfully!');
    console.log('');
    console.log('📋 Files synced:');
    FILES_TO_SYNC.forEach((file) => {
      console.log(`   • ${file.outputName}`);
    });
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

// Run the sync
syncSanityTypes();
