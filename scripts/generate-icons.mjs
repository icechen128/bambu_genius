import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('./static/icon.svg');

const sizes = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png'         },
  { size: 512, name: 'icon-512.png'         },
];

for (const { size, name } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(`./static/${name}`);
  console.log(`✅ static/${name} (${size}x${size})`);
}

console.log('\n🎉 图标生成完成！记得 git add static/*.png 提交。');
