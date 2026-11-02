import fs from "node:fs";
import { contentSecurityPolicy, SECURITY_HEADERS } from "../server/static";

const csp = contentSecurityPolicy(fs.readFileSync("dist/index.html", "utf8"));
const headers = { ...SECURITY_HEADERS, "Content-Security-Policy": csp };
fs.writeFileSync("dist/_headers", "/*\n" + Object.entries(headers)
  .map(([key, value]) => `  ${key}: ${value}`).join("\n") + "\n");
