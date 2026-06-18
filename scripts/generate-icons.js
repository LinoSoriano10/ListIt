// Genera los iconos de la app en todos los formatos necesarios para electron-builder.
// Requiere: un PNG cuadrado en src/img/icono-source.png (mínimo 1024×1024).
// Uso: node scripts/generate-icons.js
const sharp    = require('sharp');
const pngToIco = require('png-to-ico');
const fs       = require('fs');
const path     = require('path');

const SRC  = path.join(__dirname, '../src/img/icono-source.png');
const OUT  = path.join(__dirname, '../src/img');

if (!fs.existsSync(SRC)) {
  console.error(`❌ No se encontró ${SRC}. Coloca un PNG cuadrado ≥1024×1024 en esa ruta.`);
  process.exit(1);
}

async function run() {
  // PNG para Linux (256×256)
  await sharp(SRC).resize(256, 256).toFile(path.join(OUT, 'icono.png'));
  console.log('✓ icono.png (256×256)');

  // ICNS para macOS (512×512 embebido)
  await sharp(SRC).resize(512, 512).toFile(path.join(OUT, 'icono.icns'));
  console.log('✓ icono.icns (512×512)');

  // ICO para Windows (incluye 16, 32, 48, 256)
  const sizes = [16, 32, 48, 256];
  const pngs  = await Promise.all(
    sizes.map(s => sharp(SRC).resize(s, s).toBuffer())
  );
  const ico = await pngToIco(pngs);
  fs.writeFileSync(path.join(OUT, 'icono.ico'), ico);
  console.log('✓ icono.ico (16/32/48/256)');

  console.log('\n✅ Iconos generados en src/img/');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
