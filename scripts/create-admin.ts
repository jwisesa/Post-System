// Usage: npm run create-admin -- "Nama" email@example.com password
import { getDb } from "../src/db/client";
import { createUser } from "../src/lib/services";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Usage: npm run create-admin -- "Nama" email@example.com password');
  process.exit(1);
}
getDb()
  .then((db) => createUser(db, { name, email, password }))
  .then(
  (u) => {
    console.log(`Akun admin dibuat: ${u.email}`);
    process.exit(0);
  },
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
