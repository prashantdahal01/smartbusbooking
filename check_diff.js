const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, 'backend', 'models');
const controllersDir = path.join(__dirname, 'backend', 'controllers');
const routesDir = path.join(__dirname, 'backend', 'routes');
const modulesDir = path.join(__dirname, 'backend', 'modules');

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

function stat(f1, f2) {
  const s1 = fs.existsSync(f1) ? fs.statSync(f1).size : 0;
  const s2 = fs.existsSync(f2) ? fs.statSync(f2).size : 0;
  return `old: ${s1} bytes, new: ${s2} bytes`;
}

console.log('--- Models ---');
for (const [model, domain] of Object.entries(domains)) {
  const f1 = path.join(modelsDir, model + '.js');
  const f2 = path.join(modulesDir, domain, domain + '.model.js');
  console.log(model, ':', stat(f1, f2));
}

console.log('\n--- Controllers ---');
const controllers = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));
for (const ctrl of controllers) {
  const domain = ctrl.split('.')[0];
  const f1 = path.join(controllersDir, ctrl);
  const f2 = path.join(modulesDir, domain, ctrl);
  console.log(ctrl, ':', stat(f1, f2));
}

console.log('\n--- Routes ---');
const routes = fs.readdirSync(routesDir).filter(f => f.endsWith('.js') && f !== 'index.js');
for (const rt of routes) {
  const domain = rt.split('.')[0];
  const f1 = path.join(routesDir, rt);
  const f2 = path.join(modulesDir, domain, rt);
  console.log(rt, ':', stat(f1, f2));
}
