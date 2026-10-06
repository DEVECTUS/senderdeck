import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the migrated marketplace identity while using the maintained plugin source.
// Credentials belong only in the secure review form, never in this package.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(process.argv[2] || "C:/Temp/senderdeck-resubmission/openai-plugin");
if (!output.toLowerCase().startsWith("c:\\temp\\")) throw new Error("Package staging must be beneath C:\\Temp.");
await mkdir(output, { recursive: true });
await cp(path.join(root, "plugins/senderdeck"), output, { recursive: true });
const manifestPath = path.join(output, ".codex-plugin/plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const submission = JSON.parse(await readFile(path.join(root, "chatgpt-app-submission.json"), "utf8"));
manifest.name = "app-6a87125f6b308191ac268739218eac27";
manifest.author.name = "DEVECTUS Pty Ltd";
manifest.interface.developerName = "DEVECTUS Pty Ltd";
manifest.interface.shortDescription = "Manage multiple inboxes safely";
manifest.interface.supportURL = "https://senderdeck.devectus.com.au/support";
const convert = ({ description, user_prompt, tools_triggered, expected_output }) => ({
  description, prompt: user_prompt, ...(tools_triggered ? { tools_triggered } : {}), expected_behavior: expected_output,
});
manifest.extensions = { "com.openai": {
  review: {
    test_cases: { positive: submission.test_cases.map(convert), negative: submission.negative_test_cases.map(convert) },
    commerce: false,
    demo_recording_url: "https://senderdeck.devectus.com.au/demo/senderdeck-review-0.3.3.mp4",
  },
  publication: { release_notes: "Version 0.3.3 reports revoked provider authorization explicitly, distinguishes failed searches from no matches, supports MCP OAuth resource discovery paths, and uses real account and draft IDs in review scenarios. Drafts remain unsent until separate exact confirmation." },
} };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(output);
