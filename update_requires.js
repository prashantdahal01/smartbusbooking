const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');

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

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules')) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.js')) results.push(file);
    }
  });
  return results;
}

const allJsFiles = walk(backendDir);
allJsFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  Object.entries(domains).forEach(([modelName, domain]) => {
    // Regex for ANY relative path to models/ModelName e.g. ../models/User or ../../models/User
    const reqRegex = new RegExp(`(const|let|var)\\s+(\\{?\\s*${modelName}\\s*\\}?)\\s*=\\s*require\\(["'](\\.\\/|\\.\\.\\/)+models\\/${modelName}["']\\);?`, 'g');
    
    let match;
    while ((match = reqRegex.exec(content)) !== null) {
      // Find the relative path to backendDir
      const relativeToBackend = path.relative(path.dirname(file), path.join(backendDir, 'modules', domain, domain + '.model'));
      let newRequirePath = relativeToBackend.replace(/\\/g, '/');
      if (!newRequirePath.startsWith('.')) newRequirePath = './' + newRequirePath;
      
      const toReplace = match[0];
      const replacement = `const { ${modelName} } = require("${newRequirePath}");`;
      content = content.replace(toReplace, replacement);
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Updated', file);
  }
});
