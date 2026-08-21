const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
const assetsDir = path.join(__dirname, '..', 'assets');

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

  // Splash icon - 1242x2436 (iPhone X splash) or similar
  // For Expo, typically around 1284x2778 for modern devices
  await sharp(svgBuffer)
    .resize(1284, 2778, { fit: 'contain', background: { r: 99, g: 102, b: 241, alpha: 1 } })
    .png()
    .toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('✓ splash-icon.png (1284x2778)');

  // Android adaptive icon background - 432x432
  await sharp(svgBuffer)
    .resize(432, 432)
    .png()
    .toFile(path.join(assetsDir, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png (432x432)');

  // Android adaptive icon foreground - 432x432 (with transparency)
  await sharp(svgBuffer)
    .resize(432, 432)
    .png()
    .toFile(path.join(assetsDir, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png (432x432)');

  // Android monochrome icon - 432x432 (for notification/badge)
  // Create a monochrome version (white on transparent)
  await sharp(svgBuffer)
    .resize(432, 432)
    .png()
    .toFile(path.join(assetsDir, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png (432x432)');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);