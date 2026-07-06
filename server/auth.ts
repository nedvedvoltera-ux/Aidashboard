import { createHash } from "node:crypto";

const EXPECTED_DIGEST = "5db1fee4b5703808c48078a76768b155b421b210c0761cd6a5d223f4d99f1eaa";

function digestPin(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyEditPin(pin: string | null | undefined): boolean {
  if (!pin?.trim()) {
    return false;
  }
  return digestPin(pin.trim()) === EXPECTED_DIGEST;
}
