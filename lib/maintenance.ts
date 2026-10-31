import { env } from "cloudflare:workers";
import type { Identity } from "./actions";
import { readState } from "./store";
import { syncWeeks } from "./club";
import { planTestDataCleanup } from "./test-data-cleanup";

export async function purgeTestData(identity: Identity, data: Record<string, unknown>) {
  if (!env.DB) throw new Error("Chưa kết nối được cơ sở dữ liệu.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const { club, revision } = await readState(identity.userId, false);
    const result = planTestDataCleanup(club, identity, data);
    if (result.alreadyDone) return { club, revision, result };
    syncWeeks(club);
    const payload = JSON.stringify(club);
    const gate = "EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)";
    const statements = [env.DB.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?").bind(payload, revision)];
    for (const userId of result.removedUserIds) {
      statements.push(env.DB.prepare(`DELETE FROM auth_sessions WHERE account_id IN (SELECT id FROM auth_accounts WHERE user_id=?) AND ${gate}`).bind(userId, revision + 1, payload));
      statements.push(env.DB.prepare(`DELETE FROM auth_accounts WHERE user_id=? AND ${gate}`).bind(userId, revision + 1, payload));
    }
    const committed = await env.DB.batch(statements);
    if (committed[0].meta.changes) return { club, revision: revision + 1, result };
  }
  throw new Error("Có người đang cập nhật cùng lúc. Vui lòng thử lại.");
}
