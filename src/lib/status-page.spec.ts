import { describe, expect, it } from "vitest";

import { domainOfHost, normalizeDomain } from "./status-page";

describe("normalizeDomain", () => {
	it.each([
		["status.acme.com", "status.acme.com"],
		["STATUS.Acme.COM", "status.acme.com"],
		["status.acme.com.", "status.acme.com"],
		["  status.acme.com ", "status.acme.com"],
		["status.bücher.de", "status.xn--bcher-kva.de"],
		["a-b.xn--p1ai", "a-b.xn--p1ai"],
	])("reads %s as %s", (input, domain) => {
		expect(normalizeDomain(input)).toBe(domain);
	});

	it.each([
		["a bare name", "localhost"],
		["a single label", "app"],
		["a loopback name", "status.localhost"],
		["an mDNS name", "printer.local"],
		["an internal name", "postgres.railway.internal"],
		["a Kubernetes service", "uppity.default.svc"],
		["a reverse lookup zone", "1.0.0.10.in-addr.arpa"],
		["a reserved name", "evil.example"],
		["an IPv4 address", "127.0.0.1"],
		["a hex IPv4 address", "0x7f.0.0.1"],
		["a short IPv4 address", "127.1"],
		["an IPv6 address", "[::1]"],
		["a URL", "https://status.acme.com"],
		["a path", "status.acme.com/x"],
		["credentials", "user@status.acme.com"],
		["a port", "status.acme.com:8443"],
		["an underscore", "_dmarc.acme.com"],
		["a wildcard", "*.acme.com"],
		["two trailing dots", "status.acme.com.."],
		["an empty label", "status..acme.com"],
		["a leading hyphen", "-status.acme.com"],
		["a label over 63 characters", `${"a".repeat(64)}.acme.com`],
		["a name over 253 characters", `${"a.".repeat(127)}com`],
		["nothing", ""],
	])("refuses %s", (_, input) => {
		expect(normalizeDomain(input)).toBeNull();
	});
});

describe("domainOfHost", () => {
	it.each([
		["status.acme.com", "status.acme.com"],
		["Status.Acme.com:8443", "status.acme.com"],
		["status.acme.com.:443", "status.acme.com"],
	])("reads the Host header %s", (host, domain) => {
		expect(domainOfHost(host)).toBe(domain);
	});

	it.each(["10.0.0.5:3000", "[::1]:3000", "localhost:5173", "app:3000"])("refuses %s", (host) => {
		expect(domainOfHost(host)).toBeNull();
	});
});
