/* Genera il valore da mettere nel segreto ADMIN_PASSWORD_HASH.
 *
 * La password NON si conserva mai in chiaro, nemmeno fra i segreti di
 * Cloudflare: si conserva il risultato di PBKDF2-SHA256 con 210.000
 * iterazioni (la soglia raccomandata da OWASP) e un sale casuale per utente.
 * Chi leggesse il segreto non otterrebbe la password, e per ricavarla
 * dovrebbe provare ogni candidata pagando 210.000 iterazioni ogni volta.
 *
 *   node tools/genera-password-admin.mjs 'la-mia-password-lunga'
 *   npx wrangler@4 secret put ADMIN_PASSWORD_HASH
 */
import { webcrypto as crypto } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Uso: node tools/genera-password-admin.mjs 'password'");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Troppo corta: servono almeno 12 caratteri. Il pannello vede");
  console.error("nome, indirizzo e telefono di ogni cliente.");
  process.exit(1);
}

const esa = (b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

const sale = crypto.getRandomValues(new Uint8Array(16));
const chiave = await crypto.subtle.importKey(
  "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
);
const bit = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt: sale, iterations: 210000, hash: "SHA-256" }, chiave, 256
);

console.log("\nIncolla questo valore quando wrangler chiede ADMIN_PASSWORD_HASH:\n");
console.log(`${esa(sale)}:${esa(bit)}\n`);
console.log("Comando:  npx wrangler@4 secret put ADMIN_PASSWORD_HASH\n");
