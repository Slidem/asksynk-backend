import { randomBytes } from "node:crypto";

const bytes = 64;
const secret = randomBytes(bytes).toString("base64url");

process.stdout.write(secret);
process.stdout.write("\n");
