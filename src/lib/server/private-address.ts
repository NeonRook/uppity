import net from "node:net";

/**
 * Addresses a check may not reach unless the operator allows private targets: the
 * instance's own host, its private networks, cloud metadata services, and ranges
 * that are never a public host. A BlockList matches IPv4-mapped IPv6 addresses
 * against the IPv4 ranges too.
 */
const privateRanges = new net.BlockList();
for (const [prefix, bits] of [
	["0.0.0.0", 8], // "this network": 0.0.0.0 reaches the local host
	["10.0.0.0", 8],
	["100.64.0.0", 10], // carrier-grade NAT, and some metadata services
	["127.0.0.0", 8],
	["169.254.0.0", 16], // link-local, including 169.254.169.254
	["172.16.0.0", 12],
	["192.0.0.0", 24], // protocol assignments
	["192.0.2.0", 24], // documentation
	["192.168.0.0", 16],
	["198.18.0.0", 15], // benchmarking
	["198.51.100.0", 24], // documentation
	["203.0.113.0", 24], // documentation
	["224.0.0.0", 4], // multicast
	["240.0.0.0", 4], // reserved, including broadcast
] as const) {
	privateRanges.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [
	["::", 96], // unspecified, loopback and IPv4-compatible
	["64:ff9b:1::", 48], // local-use NAT64, never global
	["100::", 64], // discard
	["2001:db8::", 32], // documentation
	["fc00::", 7], // unique local, including fd00:ec2::254
	["fe80::", 10],
	["ff00::", 8], // multicast
] as const) {
	privateRanges.addSubnet(prefix, bits, "ipv6");
}

function hexGroups(part: string | undefined): number[] {
	return part ? part.split(":").map((g) => parseInt(g, 16)) : [];
}

/** The eight 16-bit groups of an IPv6 address. */
function groups(address: string): number[] {
	// The URL parser canonicalises every IPv6 spelling to compressed hex groups.
	const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
	const [head, tail] = canonical.split("::");
	const left = hexGroups(head);
	const right = hexGroups(tail);
	return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/** Dotted IPv4 from two 16-bit groups. */
function ipv4(high: number, low: number): string {
	return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** The IPv4 address a translation or tunnelling prefix carries inside `address`. */
function embeddedIPv4(address: string): string | undefined {
	const g = groups(address);
	// NAT64 well-known prefix, 64:ff9b::/96.
	if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
		return ipv4(g[6], g[7]);
	}
	// 6to4, 2002::/16, carries it in bits 16 to 48.
	if (g[0] === 0x2002) return ipv4(g[1], g[2]);
	// Teredo, 2001::/32, carries the client's address inverted in the last 32 bits.
	if (g[0] === 0x2001 && g[1] === 0) return ipv4(g[6] ^ 0xffff, g[7] ^ 0xffff);
	return undefined;
}

/** Whether `address`, an IP literal, is on a private, loopback, link-local or metadata range. */
export function isPrivateAddress(address: string): boolean {
	const family = net.isIP(address);
	if (family === 0) throw new TypeError(`Not an IP address: ${address}`);
	if (family === 4) return privateRanges.check(address, "ipv4");
	if (privateRanges.check(address, "ipv6")) return true;
	const embedded = embeddedIPv4(address);
	return embedded !== undefined && privateRanges.check(embedded, "ipv4");
}

/** Read per call, so a test can opt in without reloading the module. */
export function privateTargetsAllowed(): boolean {
	return process.env.UPPITY_ALLOW_PRIVATE_TARGETS === "true";
}
