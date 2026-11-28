// Password rules shared by forms and the server. Browser-safe: no Node-only imports.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
const EMAIL_LOCAL_PART_MIN = 4;

// Well-known passwords of 12 or more characters, lowercase. Compared case-insensitively.
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password1234", "password12345", "password123456", "password1234567", "password!234",
  "password@123", "password#1234", "passw0rd1234", "p@ssw0rd1234", "p@ssword1234",
  "p@ssw0rd!234", "passwordpassword", "password2023", "password2024", "password2025",
  "password2026", "letmein12345", "letmein123456", "letmeinletmein", "iloveyou1234",
  "iloveyou12345", "iloveyou123456", "iloveyouiloveyou", "welcome12345", "welcome123456",
  "welcome1234567", "welcome@1234", "welcometothejungle", "qwertyuiop12",
  "qwertyuiopas", "qwertyuiop123", "qwertyuiop[]", "qwerty123456", "qwerty1234567",
  "qwertyqwerty", "qwertyuiopasdfghjkl", "asdfghjkl123", "asdfghjklqwe",
  "asdfasdfasdf", "zxcvbnm12345", "zxcvbnmasdfg", "1qaz2wsx3edc", "1q2w3e4r5t6y",
  "1q2w3e4r5t6y7u", "1qazxsw23edc", "qazwsxedc123", "qazwsxedcrfv", "zaq12wsxcde3",
  "123456789012", "1234567890123", "12345678901234", "123456789abc", "1234567890qw",
  "123123123123", "111111111111", "000000000000", "121212121212", "112233445566",
  "123456123456", "abcdefghijkl", "abcdefghijklm", "abcdefghijklmnop", "abcabcabcabc",
  "abc123abc123", "abcd12345678", "abcdefg12345", "abcdefgh1234", "monkey123456",
  "dragon123456", "football1234", "baseball1234", "basketball12", "superman1234",
  "batman123456", "master123456", "shadow123456", "sunshine1234", "princess1234",
  "trustno1trustno1", "trustno12345", "admin1234567", "administrator",
  "administrator1", "administrator123", "adminadmin123", "rootroot1234", "changeme1234",
  "changeme12345", "changeit1234", "defaultpassword", "mypassword123",
  "mypassword1234", "mypassword12", "yourpassword", "yourpassword1", "newpassword123",
  "newpassword1234", "testtest1234", "testing12345", "test12345678", "test123456789",
  "secretsecret", "secret123456", "mysecretpassword", "supersecret123", "supersecret1234",
  "correcthorsebatterystaple", "thequickbrownfox", "thequickbrownfoxjumps", "internet1234",
  "computer1234", "starwars1234", "starwars12345", "pokemon12345", "liverpool1234",
  "manchester123", "chelsea12345", "arsenal12345", "michael12345", "jennifer1234",
  "charlie12345", "jordan123456", "hunter123456", "freedom12345", "whatever12345",
  "nothing12345", "cheese123456", "chocolate123", "butterfly123", "rainbow12345",
  "sunshine12345", "summer123456", "winter123456", "spring123456", "autumn123456",
  "february2025", "december2025", "iamthebest123",
  "ihatemyjob123", "loveyou123456", "fuckyou12345", "letmein!2345", "access123456",
  "login1234567", "loginlogin12", "pass12345678", "pass123456789", "passpasspass",
  "p4ssw0rd1234", "pa55word1234", "pa$$word1234", "pa$$w0rd1234", "password1password1",
]);

/** Number of Unicode code points in a string. */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

/**
 * The form a password is checked, hashed and verified in (Unicode NFKC), so the same password
 * typed on another keyboard or system (composed or decomposed accents, full-width forms) matches.
 * passwordProblem, hashPassword and verifyPassword all call it; callers pass what was typed.
 */
export function normalizePassword(password: string): string {
  return password.normalize("NFKC");
}

/** Returns a message saying what is wrong with the password, or null when it is acceptable. Rules apply to the normalised form. */
export function passwordProblem(typed: string, context?: { email?: string }): string | null {
  const password = normalizePassword(typed);
  const length = codePointLength(password);
  if (length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (new Set(password).size === 1) {
    return "Do not use one character repeated.";
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return "That password is too common.";
  }
  const email = context?.email?.trim().toLowerCase();
  if (email) {
    const at = email.lastIndexOf("@");
    const local = at === -1 ? email : email.slice(0, at);
    if (codePointLength(local) >= EMAIL_LOCAL_PART_MIN && lower.includes(local)) {
      return "Do not include the first part of your email address.";
    }
  }
  return null;
}
