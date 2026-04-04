const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// 5×7 pixel-art bitmap for "A"
const A_BITMAP = [
  [0,1,1,1,0],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,1,1,1,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
]

function generatePNG(width, height, bg, fg, outPath) {
  const scale   = Math.floor(Math.min(width, height) * 0.42 / 7)
  const charW   = 5 * scale
  const charH   = 7 * scale
  const offsetX = Math.floor((width  - charW) / 2)
  const offsetY = Math.floor((height - charH) / 2)

  const rowSize = width * 3 + 1
  const raw     = Buffer.alloc(height * rowSize)

  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0  // filter: None
    for (let x = 0; x < width; x++) {
      const cx = x - offsetX
      const cy = y - offsetY
      let isGlyph = false
      if (cx >= 0 && cx < charW && cy >= 0 && cy < charH) {
        const bx = Math.floor(cx / scale)
        const by = Math.floor(cy / scale)
        if (bx < 5 && by < 7 && A_BITMAP[by][bx] === 1) isGlyph = true
      }
      const c = isGlyph ? fg : bg
      const i = y * rowSize + 1 + x * 3
      raw[i]     = c[0]
      raw[i + 1] = c[1]
      raw[i + 2] = c[2]
    }
  }

  const deflated = zlib.deflateSync(raw, { level: 9 })

  // CRC32 table
  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    crcTable[i] = c
  }
  function crc32(buf) {
    let crc = 0xFFFFFFFF
    for (const b of buf) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  function chunk(type, data) {
    const len    = Buffer.alloc(4)
    const typeB  = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
    return Buffer.concat([len, typeB, data, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width,  0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // RGB

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0)),
  ])

  fs.writeFileSync(outPath, png)
  console.log(`✓ ${path.basename(outPath)}  (${width}×${height}, scale=${scale})`)
}

const publicDir = path.join(__dirname, '..', 'public')

// bg = #0d1b2e (13,27,46)   fg = white (255,255,255)
generatePNG(192, 192, [13, 27, 46], [255, 255, 255], path.join(publicDir, 'icon-192.png'))
generatePNG(512, 512, [13, 27, 46], [255, 255, 255], path.join(publicDir, 'icon-512.png'))
console.log('Done.')
