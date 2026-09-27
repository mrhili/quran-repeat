(function (root) {
  'use strict';

  const encoder = new TextEncoder();
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }

  const crc32 = bytes => {
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };
  const bytesOf = async value => {
    if (typeof value === 'string') return encoder.encode(value);
    if (value instanceof Uint8Array) return value;
    if (value?.arrayBuffer) return new Uint8Array(await value.arrayBuffer());
    throw new Error('Unsupported ZIP entry');
  };
  const header = length => new DataView(new ArrayBuffer(length));
  const asBytes = view => new Uint8Array(view.buffer);

  async function createZip(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('Nothing to export');
    const local = [];
    const central = [];
    const names = new Set();
    let offset = 0;
    for (const entry of entries) {
      const path = String(entry.path || '');
      if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || names.has(path)) throw new Error(`Invalid ZIP path: ${path}`);
      names.add(path);
      const name = encoder.encode(path);
      const data = await bytesOf(entry.data);
      if (name.length > 65535 || data.length > 0xffffffff) throw new Error('ZIP entry too large');
      const checksum = crc32(data);
      const start = header(30);
      start.setUint32(0, 0x04034b50, true);
      start.setUint16(4, 20, true);
      start.setUint16(6, 0x0800, true); // UTF-8 filenames.
      start.setUint16(26, name.length, true);
      start.setUint32(14, checksum, true);
      start.setUint32(18, data.length, true);
      start.setUint32(22, data.length, true);
      local.push(asBytes(start), name, data);

      const record = header(46);
      record.setUint32(0, 0x02014b50, true);
      record.setUint16(4, 20, true);
      record.setUint16(6, 20, true);
      record.setUint16(8, 0x0800, true);
      record.setUint32(16, checksum, true);
      record.setUint32(20, data.length, true);
      record.setUint32(24, data.length, true);
      record.setUint16(28, name.length, true);
      record.setUint32(42, offset, true);
      central.push(asBytes(record), name);
      offset += 30 + name.length + data.length;
    }
    const centralLength = central.reduce((sum, part) => sum + part.length, 0);
    if (offset + centralLength > 0xffffffff || entries.length > 65535) throw new Error('Review package too large');
    const end = header(22);
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralLength, true);
    end.setUint32(16, offset, true);
    return new Blob([...local, ...central, asBytes(end)], { type: 'application/zip' });
  }

  const api = { createZip, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuilderZip = api;
})(typeof window === 'undefined' ? globalThis : window);
