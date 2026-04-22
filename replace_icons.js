const fs = require('fs');
const path = require('path');

const iconMap = {
  '📊': '<i class="ph-duotone ph-chart-bar" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '👥': '<i class="ph-duotone ph-users" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '🚀': '<i class="ph-duotone ph-rocket-launch" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📋': '<i class="ph-duotone ph-clipboard-text" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '⚙️': '<i class="ph-duotone ph-gear" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📱': '<i class="ph-duotone ph-device-mobile" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '✅': '<i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i>',
  '❌': '<i class="ph-duotone ph-x-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--red);"></i>',
  '⏳': '<i class="ph-duotone ph-hourglass-medium" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '⛔': '<i class="ph-duotone ph-stop-circle" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '🕐': '<i class="ph-duotone ph-clock" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '⚡': '<i class="ph-duotone ph-lightning" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📭': '<i class="ph-duotone ph-tray" style="font-size: 1.1em; vertical-align: middle;"></i>',
  'ℹ️': '<i class="ph-duotone ph-info" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '👁️': '<i class="ph-duotone ph-eye" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '🗑️': '<i class="ph-duotone ph-trash" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '💾': '<i class="ph-duotone ph-floppy-disk" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '🔌': '<i class="ph-duotone ph-plug" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '⏱️': '<i class="ph-duotone ph-timer" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📥': '<i class="ph-duotone ph-download-simple" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📂': '<i class="ph-duotone ph-folder-open" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '☀️': '<i class="ph-duotone ph-sun" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '🌙': '<i class="ph-duotone ph-moon" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📈': '<i class="ph-duotone ph-trend-up" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '🟢': '<i class="ph-fill ph-circle" style="font-size: 1em; vertical-align: middle; color: var(--green);"></i>',
  '🔴': '<i class="ph-fill ph-circle" style="font-size: 1em; vertical-align: middle; color: var(--red);"></i>',
  '▶️': '<i class="ph-duotone ph-play-circle" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '➕': '<i class="ph-duotone ph-plus-circle" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📞': '<i class="ph-duotone ph-phone" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '✏️': '<i class="ph-duotone ph-pencil-simple" style="font-size: 1.1em; vertical-align: middle;"></i>',
  '📖': '<i class="ph-duotone ph-book-open" style="font-size: 1.1em; vertical-align: middle;"></i>'
};

const phosphorScript = '<script src="https://unpkg.com/@phosphor-icons/web"></script>\n</head>';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Add script if it's HTML and missing
  if (filePath.endsWith('.html') && content.includes('</head>') && !content.includes('@phosphor-icons/web')) {
    content = content.replace('</head>', phosphorScript);
    changed = true;
  }

  // Replace emojis safely
  for (const [emoji, htmlIcon] of Object.entries(iconMap)) {
    if (content.includes(emoji)) {
      content = content.split(emoji).join(htmlIcon);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log("Updated icons in: " + filePath);
  }
}

function traverseDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      traverseDir(full);
    } else if (f.endsWith('.html') || f.endsWith('.js')) {
      processFile(full);
    }
  }
}

// Process public folder
traverseDir(path.join(__dirname, 'public'));
// Process server.js
processFile(path.join(__dirname, 'server.js'));

console.log('Icon replacement completed!');
