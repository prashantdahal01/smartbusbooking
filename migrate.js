const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');
const modelsDir = path.join(backendDir, 'models');
const modulesDir = path.join(backendDir, 'modules');

const domains = {
  User: 'user',
  Booking: 'booking',
  Bus: 'bus',
  City: 'location',
  District: 'district',
  Notification: 'notification',
  Route: 'route',
  Schedule: 'schedule',
  SeatLock: 'seatLock',
  Stop: 'stop'
};

// 1. Rewrite model files and place them in their respective modules
Object.entries(domains).forEach(([modelName, domain]) => {
  let modelPath;
  if (modelName === 'Notification') {
    modelPath = path.join(modulesDir, 'notification', 'notification.model.js');
  } else {
    modelPath = path.join(modelsDir, modelName + '.js');
  }
  
  if (!fs.existsSync(modelPath)) return;
  
  let content = fs.readFileSync(modelPath, 'utf8');
  
  // Find module.exports = mongoose.model(...)
  const regex = /module\.exports\s*=\s*(mongoose\.model\([^)]+\));?/;
  if (regex.test(content)) {
    content = content.replace(regex, `const ${modelName} = $1;\nmodule.exports = { ${modelName} };`);
  }
  
  const destDir = path.join(modulesDir, domain);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  
  const destFile = path.join(destDir, domain + '.model.js');
  fs.writeFileSync(destFile, content);
  console.log(`Migrated ${modelName} to ${destFile}`);
});

// 2. Update requires in all module files
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.js')) results.push(file);
    }
  });
  return results;
}

const allJsFiles = walk(modulesDir);
allJsFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // Replace const X = require("../../models/X") with const { X } = require("../domain/domain.model")
  Object.entries(domains).forEach(([modelName, domain]) => {
    const reqRegex = new RegExp(`(const|let|var)\\s+${modelName}\\s*=\\s*require\\(["']\\.\\.\\/\\.\\.\\/models\\/${modelName}["']\\);?`, 'g');
    if (reqRegex.test(content)) {
      content = content.replace(reqRegex, `const { ${modelName} } = require("../${domain}/${domain}.model");`);
      changed = true;
    }
    
    // Also handle require("../models/X") in case it's in a root module file
    const reqRegex2 = new RegExp(`(const|let|var)\\s+${modelName}\\s*=\\s*require\\(["']\\.\\.\\/models\\/${modelName}["']\\);?`, 'g');
    if (reqRegex2.test(content)) {
      content = content.replace(reqRegex2, `const { ${modelName} } = require("./${domain}/${domain}.model");`);
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated requires in ${file}`);
  }
});

// 3. Remove legacy folders (assuming controllers and routes are already safe to remove as logic was migrated)
const rimraf = (dirPath) => {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file, index) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rimraf(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
    console.log(`Removed ${dirPath}`);
  }
};

rimraf(modelsDir);
rimraf(path.join(backendDir, 'controllers'));
rimraf(path.join(backendDir, 'routes'));
