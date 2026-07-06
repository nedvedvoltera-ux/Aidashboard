import os from "node:os";

export function getLanAddresses(): string[] {
  const addresses = new Set<string>();

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces ?? []) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      if (isIPv4 && !net.internal) {
        addresses.add(net.address);
      }
    }
  }

  return [...addresses];
}

export function printAccessUrls(label: string, port: number, host = "0.0.0.0") {
  console.log(`${label} (host: ${host}, port: ${port})`);
  console.log(`  Local:   http://localhost:${port}`);

  for (const ip of getLanAddresses()) {
    console.log(`  Network: http://${ip}:${port}`);
  }

  if (getLanAddresses().length === 0) {
    console.log("  Network: IP-адрес не найден — проверьте подключение к сети");
  }
}
