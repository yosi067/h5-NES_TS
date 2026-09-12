// Only the public test CA is served. Never expose the certificate directory.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
const ca = readFileSync(new URL('../../.cache/mobile-tls/rootCA.pem', import.meta.url));
const certificate = new X509Certificate(ca);
console.log('Test CA SHA-256 fingerprint:', certificate.fingerprint256);
createServer((req, res) => {
  if (req.url !== '/rootCA.crt' || req.method !== 'GET') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/x-x509-ca-cert',
    'Content-Disposition': 'attachment; filename="N64-local-test-CA.crt"',
    'Cache-Control': 'no-store',
  });
  res.end(certificate.raw);
}).listen(5174, '0.0.0.0', () => console.log('Public CA only: http://<LAN-IP>:5174/rootCA.crt'));