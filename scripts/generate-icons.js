const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');
const bgSvgPath = path.join(assetsDir, 'icon-background.svg');
const fgSvgPath = path.join(assetsDir, 'icon-foreground.svg');
const monoSvgPath = path.join(assetsDir, 'icon-monochrome.svg');

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);

  // App icon - 1024x1024 (App Store requirement)
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('✓ icon.png (1024x1024)');

  // Favicon - 48x48
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('✓ favicon.png (48x48)');

  // Splash icon - 1284x2778 (iPhone X splash) or similar
  // Nền splash = màu cam thương hiệu (#FB512A) đồng bộ icon
  await sharp(svgBuffer)
    .resize(1284, 2778, { fit: 'contain', background: { r: 251, g: 81, b: 42, alpha: 1 } })
    .png()
    .toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('✓ splash-icon.png (1284x2778)');

  // Android adaptive icon background - 432x432 (gradient full-bleed, không glyph)
  await sharp(fs.readFileSync(bgSvgPath))
    .resize(432, 432)
    .png()
    .toFile(path.join(assetsDir, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png (432x432)');

  // Android adaptive icon foreground - 432x432 (glyph trong safe zone, nền trong suốt)
  await sharp(fs.readFileSync(fgSvgPath))
    .resize(432, 432)
    .png()
    .toFile(path.join(assetsDir, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png (432x432)');

  // Android monochrome icon - 432x432 (silhouette trắng cho themed icon)
  await sharp(fs.readFileSync(monoSvgPath))
    .resize(432, 432)
    .png()
    .toFile(path.join(assetsDir, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png (432x432)');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
