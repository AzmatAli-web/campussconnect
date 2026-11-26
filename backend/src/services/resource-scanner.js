import net from 'node:net';
import {HttpError} from '../lib/http-error.js';

const unavailable = () => new HttpError(503, 'RESOURCE_SCANNER_UNAVAILABLE',
  'PDF scanning is unavailable. Please retry the upload later.');

// clamd INSTREAM protocol. Only a complete, explicit clean reply permits publication.
export async function scanResource(bytes, {
  host = process.env.RESOURCE_CLAMD_HOST,
  port = Number(process.env.RESOURCE_CLAMD_PORT || 3310)
} = {}) {
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw unavailable();
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({host, port});
    const timeout = setTimeout(() => socket.destroy(unavailable()), 30000);
    let reply = '';
    socket.on('error', () => reject(unavailable()));
    socket.on('close', () => {
      clearTimeout(timeout);
      reject(unavailable());
    });
    socket.on('connect', () => {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(bytes.length);
      socket.write('zINSTREAM\0');
      socket.write(header);
      socket.write(bytes);
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', chunk => {
      reply += chunk.toString('latin1');
      if (reply.length > 4096) return socket.destroy(unavailable());
      if (!reply.includes('\0')) return;
      if (reply === 'stream: OK\0') resolve();
      else if (/^stream: [^\0\r\n]+ FOUND\0$/.test(reply))
        reject(new HttpError(422, 'RESOURCE_SCAN_REJECTED', 'PDF rejected by the file scanner'));
      else reject(unavailable());
      socket.destroy();
    });
  });
}
