/**
 * Client-side-only IP shape/privacy checks for the GeoIP enricher's visual
 * "public IP" badge. Purely a rendering decision — never stored server-side,
 * never used for filtering.
 */

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

export function isIpAddress(value: string): boolean {
  return IPV4_REGEX.test(value) || (value.includes(":") && IPV6_REGEX.test(value));
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function isPrivateIpv6(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  return false;
}

/** Whether an IP-shaped string is within a private/reserved range (RFC1918, loopback, link-local). */
export function isPrivateIp(value: string): boolean {
  if (IPV4_REGEX.test(value)) return isPrivateIpv4(value);
  if (value.includes(":")) return isPrivateIpv6(value);
  return false;
}
