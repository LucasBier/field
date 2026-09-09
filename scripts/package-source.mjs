import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { sourceFiles, localHosting } from './source-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = sourceFiles(root).map((path) => ({
  name: 'field/' + path,
  data: readFileSync(join(root, path)),
}));
entries.push({
  name: 'field/.openai/hosting.json',
  data: Buffer.from(JSON.stringify(localHosting, null, 2) + '\n'),
});
entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const { name, data } of entries) {
  const filename = Buffer.from(name);
  const packed = deflateRawSync(data, { level: 9 });
  const checksum = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(filename.length, 26);
  local.push(header, filename, packed);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(8, 10);
  record.writeUInt16LE(33, 14);
  record.writeUInt32LE(checksum, 16);
  record.writeUInt32LE(packed.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(filename.length, 28);
  record.writeUInt32LE(offset, 42);
  central.push(record, filename);
  offset += header.length + filename.length + packed.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const output = join(root, 'public/downloads/field-source.zip');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([...local, directory, end]));
console.log(
  `Source download ready: ${entries.length} files; no hosted project binding or workspace data.`,
);
