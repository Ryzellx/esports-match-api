import { createApp } from "./src/app.js";
const port = process.env.PORT || 8079;
createApp().listen(port, "0.0.0.0", () => console.log(`esports-api listening on :${port}`));
