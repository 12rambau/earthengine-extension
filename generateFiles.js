const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const extract = require('extract-zip');

const tempDir = path.join(__dirname, 'temp');
const sources = [
  { name: 'gadm41_SGP.gpkg', url: 'https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_SGP.gpkg' },
  {
    name: 'gadm41_SGP_shp.zip',
    url: 'https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_SGP_shp.zip',
    extractTo: 'gadm41_SGP_shp',
  },
  {
    name: 'gadm41_SGP_1.json.zip',
    url: 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_SGP_1.json.zip',
    extractTo: 'gadm41_SGP_json',
  },
  {
    name: 'gadm41_SGP_1.kmz',
    url: 'https://geodata.ucdavis.edu/gadm/gadm4.1/kmz/gadm41_SGP_1.kmz',
  },
];

/** Download a source once, publishing only a complete file to the cache. */
async function download(source) {
  const destination = path.join(tempDir, source.name);
  if (fs.existsSync(destination)) {
    console.log(`Already present: ${destination}`);
    return destination;
  }

  console.log(`Downloading ${source.url}`);
  const response = await fetch(source.url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${source.url}: HTTP ${response.status}`);
  }

  const partial = `${destination}.${process.pid}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: 'wx' }));
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
  return destination;
}

/** Extract a ZIP into a fresh directory, replacing old output only on success. */
async function extractArchive(archive, directory) {
  const staging = fs.mkdtempSync(`${directory}.staging-`);
  try {
    try {
      await extract(archive, { dir: staging });
    } catch (error) {
      fs.rmSync(archive, { force: true });
      throw error;
    }

    const backup = `${directory}.backup-${randomUUID()}`;
    const hadDirectory = fs.existsSync(directory);
    try {
      if (hadDirectory) fs.renameSync(directory, backup);
      fs.renameSync(staging, directory);
    } catch (error) {
      if (hadDirectory && fs.existsSync(backup)) fs.renameSync(backup, directory);
      throw error;
    }
    if (hadDirectory) fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Download the dataset sources and publish each completed extraction. */
async function main() {
  fs.mkdirSync(tempDir, { recursive: true });
  for (const source of sources) {
    const archive = await download(source);
    if (source.extractTo) {
      const directory = path.join(tempDir, source.extractTo);
      await extractArchive(archive, directory);
      console.log(`Extracted: ${directory}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
