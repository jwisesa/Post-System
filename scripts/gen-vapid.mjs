// Prints a VAPID keypair for web push: node scripts/gen-vapid.mjs
import { generateKeyPairSync } from "node:crypto";
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
console.log(`VAPID_PUBLIC_KEY=${pub.toString("base64url")}\nVAPID_PRIVATE_KEY=${jwk.d}\nVAPID_SUBJECT=mailto:ganti-dengan-email-anda@contoh.id`);
void publicKey;
