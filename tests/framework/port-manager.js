import { createServer } from 'node:net';

/**
 * Find an available TCP port. Binds to port 0 to let the OS assign one,
 * then closes the server and returns the port number.
 */
export async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Check if a port is currently in use.
 */
export async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => resolve(true));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(false));
    });
  });
}

/**
 * Get N unique available ports for parallel test isolation.
 */
export async function getAvailablePorts(count) {
  const ports = [];
  for (let i = 0; i < count; i++) {
    const port = await findAvailablePort();
    ports.push(port);
  }
  return ports;
}
