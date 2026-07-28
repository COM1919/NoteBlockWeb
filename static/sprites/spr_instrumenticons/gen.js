// 生成 16 个乐器的 PNG 文件（按 NoteBlockStudio 索引顺序命名）
// 运行: node gen.js
const fs = require('fs');
const path = require('path');

// yy 中 frames 顺序 (frames 索引 -> filename)
const frameOrder = [
  '300822ce-4ef2-4748-94cc-bfac3792ddb9.png',  // frame 0
  'e408702d-26a2-4c5c-8f5e-9bb617641d05.png',  // frame 1
  '2be626e6-930c-4256-a3cb-447c757d7a5d.png',  // frame 2
  '7ff79a63-42a4-4cd9-ad12-f6bac5505a64.png',  // frame 3
  '890a0185-165e-476e-943f-939601f133ba.png',  // frame 4
  'e8bc43d8-3e2d-47be-990b-ef2efb09733d.png',  // frame 5
  'f29f0827-cf28-460b-8668-d6d9e695d004.png',  // frame 6
  '2aac095a-9c03-4642-82a0-2688f5411ac0.png',  // frame 7
  '05dd53ec-2406-4a16-9ef2-258acfa4fed3.png',  // frame 8
  '44f8cf0d-604b-4404-a995-9d0526bdd1cd.png',  // frame 9
  'f439b795-4097-4d3d-a2ca-a81dcb3142bc.png',  // frame 10
  'c4f51c39-5e44-4c1f-82a5-524b50dd4ef7.png',  // frame 11
  '03f23b02-b058-4236-9123-dcab3e8925ce.png',  // frame 12
  '2d3efe6e-8277-4c9d-84f3-f19f4561b2b0.png',  // frame 13
  'fc75183b-ccf6-4588-9f1f-f4aeffba973f.png',  // frame 14
  '76c38b92-f26b-45f5-8581-0178cc99cd26.png',  // frame 15
  'b0443b9b-ed75-4725-8e1a-e3482a4597b7.png',  // frame 16 (extra)
];

const srcDir = path.join(__dirname, '..', '..', '..', 'NoteBlockStudio-main', 'sprites', 'spr_instrumenticons');
const dstDir = __dirname;

// instrument_list 顺序（0..15）:
// 0: Harp, 1: Double Bass, 2: Bass Drum, 3: Snare, 4: Click, 5: Guitar,
// 6: Flute, 7: Bell, 8: Chime, 9: Xylophone, 10: Iron Xylophone, 11: Cow Bell,
// 12: Didgeridoo, 13: Bit, 14: Banjo, 15: Pling
// spr_instrumenticons frame index 直接对应 instrument_list index
// 由于 16 帧在 .yy 中有 17 个文件 (0..16)，我们只用前 16 个 frame

for (let i = 0; i < 16; i++) {
  const src = path.join(srcDir, frameOrder[i]);
  const dst = path.join(dstDir, 'inst_' + i + '.png');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log('Copied ' + i + ' -> ' + path.basename(dst) + ' (from ' + frameOrder[i] + ')');
  } else {
    console.error('Missing: ' + src);
  }
}
console.log('Done.');
