export async function verifyPin(input: string): Promise<boolean> {
  if (!input.trim()) {
    return false;
  }

  try {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: input.trim() }),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { valid?: boolean };
    return Boolean(payload.valid);
  } catch {
    return false;
  }
}
