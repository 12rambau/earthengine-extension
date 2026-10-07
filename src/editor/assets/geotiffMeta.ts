/**
 * @module geotiffMeta
 * Minimal, dependency-free reader for a single TIFF metadata value: the
 * number of bands (the `SamplesPerPixel` IFD tag). Reads only the header and
 * the first IFD — never the pixel data — so it stays fast on large COGs.
 */

import * as fs from 'fs';

const TAG_SAMPLES_PER_PIXEL = 277;

/**
 * Returns the band count declared in a classic TIFF's first IFD.
 *
 * @throws If the file is not a classic (non-Big) TIFF or the tag is absent.
 */
export async function readTiffBandCount(filePath: string): Promise<number> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(8);
    await handle.read(header, 0, 8, 0);
    const byteOrder = header.toString('ascii', 0, 2);
    if (byteOrder !== 'II' && byteOrder !== 'MM') {
      throw new Error('Not a TIFF file.');
    }
    const le = byteOrder === 'II';
    const readU16 = (buf: Buffer, offset: number) => (le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset));
    const readU32 = (buf: Buffer, offset: number) => (le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset));

    if (readU16(header, 2) !== 42) {
      throw new Error('BigTIFF is not supported.');
    }

    const ifdOffset = readU32(header, 4);
    const countBuf = Buffer.alloc(2);
    await handle.read(countBuf, 0, 2, ifdOffset);
    const entryCount = readU16(countBuf, 0);

    const entries = Buffer.alloc(entryCount * 12);
    await handle.read(entries, 0, entries.length, ifdOffset + 2);

    for (let i = 0; i < entryCount; i++) {
      const base = i * 12;
      if (readU16(entries, base) === TAG_SAMPLES_PER_PIXEL) {
        // SHORT, count 1: the value sits in the first two bytes of the value/offset field.
        return readU16(entries, base + 8);
      }
    }
    throw new Error('SamplesPerPixel tag not found.');
  } finally {
    await handle.close();
  }
}
