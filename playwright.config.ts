import { defineConfig } from "@playwright/test";

export default defineConfig({
	webServer: { command: "aubr build && aubr preview", port: 4173 },
	testDir: "e2e",
});
