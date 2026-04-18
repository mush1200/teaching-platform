const db = require("../config/db");

async function writeActivityLog({
  actorId = null,
  actorRole = null,
  targetType,
  targetId,
  action,
  meta = {},
}) {
  await db.query(
    `INSERT INTO activity_logs(actor_id, actor_role, target_type, target_id, action, meta)
     VALUES($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actorId,
      actorRole,
      targetType,
      targetId ? String(targetId) : null,
      action,
      JSON.stringify(meta || {}),
    ]
  );
}

module.exports = {
  writeActivityLog,
};
