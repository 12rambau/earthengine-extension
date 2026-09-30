// Bridges [::1]:PORT -> 127.0.0.1:PORT for every extension host launched with
// --inspect-brk: js-debug attaches over IPv6 while Node's inspector binds IPv4 only.
const net = require('net');
const { execSync } = require('child_process');

const active = new Map();

function bridge(port) {
  const server = net.createServer((client) => {
    const upstream = net.connect(port, '127.0.0.1');
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  server.on('error', (err) => {
    console.log(`[bridge] bind [::1]:${port} failed: ${err.code}`);
    active.delete(port);
  });
  server.listen(port, '::1', () => console.log(`[bridge] [::1]:${port} -> 127.0.0.1:${port}`));
  active.set(port, server);
}

function scan() {
  let out = '';
  try {
    out = execSync('ps -eo args', { encoding: 'utf8' });
  } catch {
    return;
  }
  const ports = new Set();
  for (const line of out.split('\n')) {
    if (!line.includes('--type=extensionHost')) continue;
    const match = /--inspect-brk=(\d+)/.exec(line);
    if (match) ports.add(Number(match[1]));
  }
  for (const port of ports) {
    if (!active.has(port)) bridge(port);
  }
  for (const [port, server] of active) {
    if (!ports.has(port)) {
      server.close();
      active.delete(port);
      console.log(`[bridge] closed ${port}`);
    }
  }
}

setInterval(scan, 300);
scan();
console.log('[bridge] watching for --inspect-brk extension hosts');
