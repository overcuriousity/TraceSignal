/**
 * Client-side-only IP shape/privacy checks for the Explorer's enrichment
 * badge. Purely a rendering decision — never stored server-side, never used
 * for filtering. Loosely mirrors the backend eligibility semantics only; TS
 * has no stdlib `ipaddress`, so IPv4 stays a regex and IPv6 is parsed into
 * hextets below.
 */

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/**
 * Expand an IPv6 literal into its 8 hextet values. Strips a %zone suffix,
 * handles `::` compression and an embedded IPv4 tail (`::ffff:1.2.3.4`).
 * Returns null when the string is not valid IPv6.
 */
function parseIpv6Hextets(value: string): number[] | null {
  let text = value;
  const zoneIndex = text.indexOf("%");
  if (zoneIndex !== -1) text = text.slice(0, zoneIndex);
  if (!text.includes(":")) return null;

  // Embedded IPv4 tail -> two hextets.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!IPV4_REGEX.test(tail)) return null;
    const octets = tail.split(".").map(Number);
    const hex = (
      ((octets[0] << 8) | octets[1]).toString(16) +
      ":" +
      (((octets[2] << 8) | octets[3]).toString(16))
    );
    text = text.slice(0, lastColon + 1) + hex;
  }

  const compressions = text.split("::").length - 1;
  if (compressions > 1) return null;

  const toHextets = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const out: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };

  if (compressions === 1) {
    const [headText, tailText] = text.split("::");
    const head = toHextets(headText);
    const rest = toHextets(tailText);
    if (head === null || rest === null) return null;
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null; // "::" must stand for at least one group
    return [...head, ...Array(missing).fill(0), ...rest];
  }

  const hextets = toHextets(text);
  return hextets !== null && hextets.length === 8 ? hextets : null;
}

export function isIpAddress(value: string): boolean {
  return IPV4_REGEX.test(value) || parseIpv6Hextets(value) !== null;
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
  const hextets = parseIpv6Hextets(value);
  if (hextets === null) return false;
  // Loopback ::1 in any textual form (compressed or not).
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return true;
  if ((hextets[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((hextets[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  return false;
}

/** Whether an IP-shaped string is within a private/reserved range (RFC1918, loopback, link-local). */
export function isPrivateIp(value: string): boolean {
  if (IPV4_REGEX.test(value)) return isPrivateIpv4(value);
  if (value.includes(":")) return isPrivateIpv6(value);
  return false;
}
