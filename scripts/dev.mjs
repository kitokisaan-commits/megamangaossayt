// Keep the production framework in Work's supervised development server.
const args = process.argv.slice(2),
  nextArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--host") {
    nextArgs.push(
      "--hostname",
      args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "0.0.0.0",
    );
  } else if (args[i] !== "--strictPort") nextArgs.push(args[i]);
}
const entry = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [process.execPath, entry.pathname, "dev", ...nextArgs];
await import(entry.href);
