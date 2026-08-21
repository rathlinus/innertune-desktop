const { app } = require("electron");
app.on("ready", async () => {
  try { require("./_probe_entry.cjs"); } catch (e) { console.log("ERR", e); }
  setTimeout(() => app.exit(0), 25000);
});
