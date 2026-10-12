import { describe, expect, test } from "vitest";

import { isPrivateAddress } from "./private-address";

const hex = (x: number, y: number) => ((x << 8) | y).toString(16);
const inverted = (x: number, y: number) => (((x << 8) | y) ^ 0xffff).toString(16);

type Octets = readonly [number, number, number, number];

/** Each way IPv6 can carry an IPv4 address, applied to `octets`. */
function wrappers([a, b, c, d]: Octets): Record<string, string> {
	return {
		mapped: `::ffff:${a}.${b}.${c}.${d}`,
		"mapped, hex": `::ffff:${hex(a, b)}:${hex(c, d)}`,
		compatible: `::${hex(a, b)}:${hex(c, d)}`,
		nat64: `64:ff9b::${hex(a, b)}:${hex(c, d)}`,
		"6to4": `2002:${hex(a, b)}:${hex(c, d)}::1`,
		teredo: `2001:0:4136:e378:8000:63bf:${inverted(a, b)}:${inverted(c, d)}`,
	};
}

describe("isPrivateAddress", () => {
	test.each([
		"0.0.0.0",
		"10.1.2.3",
		"100.64.0.1",
		"100.127.255.254",
		"127.0.0.1",
		"127.255.255.255",
		"169.254.169.254",
		"172.16.0.1",
		"172.31.255.255",
		"192.0.0.8",
		"192.0.2.1",
		"192.168.1.1",
		"198.18.0.1",
		"198.19.255.255",
		"198.51.100.7",
		"203.0.113.9",
		"224.0.0.1",
		"239.255.255.250",
		"240.0.0.1",
		"255.255.255.255",
		"::",
		"::1",
		"64:ff9b:1::a00:1",
		"100::1",
		"2001:db8::1",
		"fc00::1",
		"fd00:ec2::254",
		"fe80::1",
		"ff02::1",
		"0:0:0:0:0:ffff:a9fe:a9fe",
	])("refuses %s", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	test.each([
		"1.1.1.1",
		"8.8.8.8",
		"100.63.255.255",
		"100.128.0.0",
		"172.15.255.255",
		"172.32.0.0",
		"192.0.1.255",
		"192.169.0.1",
		"198.17.255.255",
		"198.20.0.0",
		"223.255.255.255",
		"2606:4700:4700::1111",
		"2001:db9::1",
	])("allows %s", (address) => {
		expect(isPrivateAddress(address)).toBe(false);
	});

	const privateOctets: Octets[] = [
		[10, 0, 0, 1],
		[127, 0, 0, 1],
		[169, 254, 169, 254],
	];
	const embedded = privateOctets.flatMap((octets) =>
		Object.entries(wrappers(octets)).map(([form, address]) => [form, octets.join("."), address]),
	);
	test.each(embedded)("refuses %s of %s (%s)", (_form, _ipv4, address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	const publicWrapped = Object.entries(wrappers([1, 1, 1, 1])).filter(
		// The compatible form is deprecated and refused whatever it carries.
		([form]) => form !== "compatible",
	);
	test.each(publicWrapped)("allows %s of 1.1.1.1 (%s)", (_form, address) => {
		expect(isPrivateAddress(address)).toBe(false);
	});
});
