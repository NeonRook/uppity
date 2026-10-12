import { describe, expect, test } from "vitest";

import { isPrivateAddress } from "./private-address";

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
		"192.168.1.1",
		"::",
		"::1",
		"fe80::1",
		"fc00::1",
		"fd00:ec2::254",
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"0:0:0:0:0:ffff:a9fe:a9fe",
		"::ffff:10.0.0.1",
		"::ffff:100.64.0.1",
		"::ffff:0.0.0.0",
		"::127.0.0.1",
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
		"192.169.0.1",
		"2606:4700:4700::1111",
		"::ffff:1.1.1.1",
	])("allows %s", (address) => {
		expect(isPrivateAddress(address)).toBe(false);
	});
});
