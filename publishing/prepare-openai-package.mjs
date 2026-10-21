import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the migrated marketplace identity while using the maintained plugin source.
// Credentials belong only in the secure review form, never in this package.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(process.argv[2] || "C:/Temp/senderdeck-resubmission/openai-plugin");
if (!output.toLowerCase().startsWith("c:\\temp\\")) throw new Error("Package staging must be beneath C:\\Temp.");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "plugins/senderdeck"), output, { recursive: true });
await rm(path.join(output, ".claude-plugin"), { recursive: true, force: true });
const manifestPath = path.join(output, ".codex-plugin/plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const submission = JSON.parse(await readFile(path.join(root, "chatgpt-app-submission.json"), "utf8"));
// The directory listing was migrated from an Apps SDK submission. Keep its
// verified package identity; repository installs continue to use "senderdeck".
manifest.name = "app-6a87125f6b308191ac268739218eac27";
manifest.author.name = "DEVECTUS Pty Ltd";
manifest.interface.developerName = "DEVECTUS Pty Ltd";
// Preserve the current listing copy from the maintained plugin manifest.
const convert = ({ description, user_prompt, tools_triggered, expected_output }) => ({
  description, prompt: user_prompt, ...(tools_triggered ? { tools_triggered } : {}), expected_behavior: expected_output,
});
manifest.extensions = { "com.openai": {
  review: {
    test_cases: { positive: submission.test_cases.map(convert), negative: submission.negative_test_cases.map(convert) },
    commerce: false,
    demo_recording_url: "https://senderdeck.devectus.com.au/demo/senderdeck-review-0.3.3.mp4",
  },
  publication: { release_notes: "Version 0.4.11 simplifies Meta connection, removes the maintenance dependency from sign-in, installs selected Page subscriptions automatically and keeps infrastructure diagnostics in the protected operator area." },
} };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(output);
