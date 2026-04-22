const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

// 1. Update style.css
const stylePath = path.join(publicDir, 'css', 'style.css');
let styleCss = fs.readFileSync(stylePath, 'utf8');

const themeRootMatch = /:root\s*\{[\s\S]*?\}/;
if(styleCss.match(themeRootMatch)) {
  const lightThemeBlock = `
[data-theme="light"] {
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-card-hover: #f1f5f9;
  --bg-input: #f8fafc;
  --border: #e2e8f0;
  --border-focus: #25D366;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --shadow: 0 4px 20px rgba(0,0,0,0.05);
  --shadow-green: 0 4px 20px rgba(37, 211, 102, 0.15);
  --green-glow: rgba(37, 211, 102, 0.1);
  --red-soft: rgba(239, 68, 68, 0.1);
  --yellow-soft: rgba(245, 158, 11, 0.1);
  --blue-soft: rgba(59, 130, 246, 0.1);
}
`;
  styleCss = styleCss.replace(themeRootMatch, (match) => match + '\n' + lightThemeBlock);
  fs.writeFileSync(stylePath, styleCss);
  console.log('Updated style.css with light theme variables.');
}

// 2. Update app.js
const appJsPath = path.join(publicDir, 'js', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

if (!appJs.includes('toggleTheme')) {
  const themeLogic = `
// ===== THEME LOGIC =====
function initTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Initialize theme early
initTheme();
`;
  appJs = themeLogic + '\n' + appJs;
  fs.writeFileSync(appJsPath, appJs);
  console.log('Updated app.js with theme logic.');
}

// 3. Update HTML files
const htmlFiles = ['index.html', 'clients.html', 'send.html', 'campaigns.html', 'settings.html'];
const themeBtnHtml = `<button class="btn btn-secondary btn-sm" id="themeToggleBtn" onclick="toggleTheme()" style="font-size: 16px; padding: 6px 10px;" title="Режимді өзгерту">☀️</button>\n      `;

htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    let html = fs.readFileSync(filePath, 'utf8');
    
    // inject head theme init to prevent flash
    const headInjection = `<script>
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  </script>`;
    if (!html.includes('localStorage.getItem(\'theme\')')) {
        html = html.replace('</head>', `  ${headInjection}\n</head>`);
    }

    if (!html.includes('id="themeToggleBtn"')) {
      html = html.replace('<div class="topbar-actions">', '<div class="topbar-actions">\n      ' + themeBtnHtml);
      fs.writeFileSync(filePath, html);
      console.log('Updated ' + file + ' with toggle button.');
    }
  }
});
