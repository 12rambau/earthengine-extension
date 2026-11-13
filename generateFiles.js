const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

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

async function main() {
  fs.mkdirSync(tempDir, { recursive: true });
  for (const source of sources) {
    const archive = await download(source);
    if (source.extractTo) {
      const directory = path.join(tempDir, source.extractTo);
      fs.mkdirSync(directory, { recursive: true });
      execFileSync('unzip', ['-nq', archive, '-d', directory], { stdio: 'inherit' });
      console.log(`Extracted: ${directory}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
