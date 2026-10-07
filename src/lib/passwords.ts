/** Random owner password so the chosen permissions are enforced. Never shown to the user. */
export function generateOwnerPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password === "") return "Password is required.";
  if (password !== confirm) return "Passwords don't match.";
  return null;
}
