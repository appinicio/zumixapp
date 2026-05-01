const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadSw({ now = new Date('2026-05-01T21:00:00Z') } = {}) {
  const listeners = {};
  const ctx = {
    caches: {
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    fetch: async () => ({ status: 200, clone() { return this; } }),
    clients: {
      matchAll: async () => [],
      openWindow: async () => 'opened',
    },
    self: {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      registration: { showNotification: async () => {} },
    },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return new Date(now).getTime(); }
    },
    Promise,
  };

  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('./sw.js', 'utf8'), ctx);
  return { listeners, ctx };
}

test('message dispara recordatorio y notificación a la hora configurada', async () => {
  const { listeners, ctx } = loadSw({ now: new Date('2026-05-01T21:00:00') });
  const sent = [];
  let notified = false;
  ctx.self.registration.showNotification = async () => { notified = true; };

  await listeners.message({
    data: { type: 'CHECK_REMINDER', active: true, time: '21:00', firedKey: 'old' },
    source: { postMessage: (msg) => sent.push(msg) },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'REMINDER_FIRE');
  assert.equal(notified, true);
});

test('message no rompe si event.source no existe', async () => {
  const { listeners, ctx } = loadSw({ now: new Date('2026-05-01T21:00:00') });
  let notified = false;
  ctx.self.registration.showNotification = async () => { notified = true; };

  await assert.doesNotReject(async () => {
    await listeners.message({
      data: { type: 'CHECK_REMINDER', active: true, time: '21:00', firedKey: 'old' },
    });
  });

  assert.equal(notified, true);
});
