import "dotenv/config";
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Sans ce gestionnaire, une connexion inactive coupée par le serveur PostgreSQL
// émet une erreur non interceptée qui arrête tout le processus Node.
pool.on("error", (err) => {
  console.error("Erreur sur une connexion PostgreSQL inactive :", err.message);
});

// Exécute `fn(client)` dans une transaction : COMMIT si tout passe, ROLLBACK sinon.
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultat = await fn(client);
    await client.query("COMMIT");
    return resultat;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
