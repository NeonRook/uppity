import net from "node:net";

/**
 * Addresses a check may not reach unless the operator allows private targets: the
 * instance's own host, its private networks, and cloud metadata services. A BlockList
 * matches IPv4-mapped IPv6 addresses against the IPv4 ranges too.
 */
const privateRanges = new net.BlockList();
privateRanges.addSubnet("0.0.0.0", 8, "ipv4"); // "this network": 0.0.0.0 reaches the local host
privateRanges.addSubnet("10.0.0.0", 8, "ipv4");
privateRanges.addSubnet("100.64.0.0", 10, "ipv4"); // carrier-grade NAT, and some metadata services
privateRanges.addSubnet("127.0.0.0", 8, "ipv4");
privateRanges.addSubnet("169.254.0.0", 16, "ipv4"); // link-local, including 169.254.169.254
privateRanges.addSubnet("172.16.0.0", 12, "ipv4");
privateRanges.addSubnet("192.168.0.0", 16, "ipv4");
privateRanges.addSubnet("::", 96, "ipv6"); // unspecified, loopback and IPv4-compatible
privateRanges.addSubnet("fe80::", 10, "ipv6");
privateRanges.addSubnet("fc00::", 7, "ipv6"); // unique local, including fd00:ec2::254

/** Whether `address`, an IP literal, is on a private, loopback, link-local or metadata range. */
export function isPrivateAddress(address: string): boolean {
	const family = net.isIP(address);
	if (family === 0) throw new TypeError(`Not an IP address: ${address}`);
	return privateRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Read per call, so a test can opt in without reloading the module. */
export function privateTargetsAllowed(): boolean {
	return process.env.UPPITY_ALLOW_PRIVATE_TARGETS === "true";
}
