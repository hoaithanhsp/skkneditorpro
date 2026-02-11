// Utility: hash password bằng SHA-256 (Web Crypto API)
// Không lưu plain text password trong code hay network
export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface AccountEntry {
    username: string;
    passwordHash: string;
    displayName: string;
}
