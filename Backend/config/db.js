const { Pool } = require("pg");

function buildDbConfig() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString && connectionString.trim()) {
    return { connectionString: connectionString.trim() };
  }

  const hasDiscreteConfig =
    process.env.PGHOST ||
    process.env.PGPORT ||
    process.env.PGUSER ||
    process.env.PGDATABASE;

  if (!hasDiscreteConfig) {
    throw new Error(
      "Database config missing. Set DATABASE_URL, or set PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE."
    );
  }

  return {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "postgres",
    password: String(process.env.PGPASSWORD || ""),
    database: process.env.PGDATABASE || "postgres",
  };
}

const pool = new Pool(buildDbConfig());

pool.on("error", (err) => {
  console.error("PostgreSQL pool idle-client error:", err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
