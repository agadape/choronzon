// Minimal SOCKS5 (no auth, CONNECT, domain/IPv4) -> HTTP CONNECT bridge.
// Only needed inside a sandbox whose egress is an HTTP proxy (HTTPS_PROXY).
// On a normal machine you don't need this: run devtool with the default --connection direct.
// Usage: node tools/socks2connect.mjs [port=1080]   then devtool ... --connection socks5://127.0.0.1:1080
import net from "node:net";

const proxy = new URL(process.env.HTTPS_PROXY || process.env.https_proxy);
const PORT = Number(process.argv[2] || 1080);

net.createServer((c) => {
  c.once("data", (greet) => {
    if (greet[0] !== 5) return c.destroy();
    c.write(Buffer.from([5, 0]));
    c.once("data", (req) => {
      let host, i;
      if (req[3] === 3) { const n = req[4]; host = req.subarray(5, 5 + n).toString(); i = 5 + n; }
      else if (req[3] === 1) { host = [...req.subarray(4, 8)].join("."); i = 8; }
      else return c.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
      const port = req.readUInt16BE(i);
      const up = net.connect(Number(proxy.port), proxy.hostname, () => {
        up.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
        up.once("data", (resp) => {
          const ok = / 200 /.test(resp.toString().split("\r\n")[0]);
          c.write(Buffer.from([5, ok ? 0 : 5, 0, 1, 0, 0, 0, 0, 0, 0]));
          if (!ok) { console.error("proxy refused", host, resp.toString().split("\r\n")[0]); return c.destroy(); }
          up.pipe(c); c.pipe(up);
        });
      });
      up.on("error", () => c.destroy()); c.on("error", () => up.destroy());
    });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`socks5 bridge on 127.0.0.1:${PORT} -> ${proxy.host}`));
