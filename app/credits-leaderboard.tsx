"use client";

import { useEffect, useState } from "react";
import { formatCredits, type CreditsRanking } from "../lib/games";
import { MemberName, useMemberIdentity } from "./member-identity";
import { RankNumber } from "./scoreboard";
import { Avatar, Button, PanelHead } from "./ui";

export default function CreditsLeaderboard({ memberId, workspaceRevision }: { memberId: string; workspaceRevision: number }) {
  const identity = useMemberIdentity();
  const [ranking, setRanking] = useState<CreditsRanking>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let pending: AbortController | undefined;
    async function refresh() {
      if (document.hidden) return;
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await fetch("/api/games?view=rank", { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) setRanking(undefined);
        if (!response.ok) throw new Error(response.status === 401 ? "Vui lòng đăng nhập để xem xếp hạng" : "Chưa tải được bảng xếp hạng");
        const next = await response.json() as CreditsRanking;
        if (controller.signal.aborted) return;
        setRanking(current => current && current.revision >= next.revision ? current : next);
        setError("");
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Chưa tải được bảng xếp hạng");
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      pending?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [workspaceRevision, retry]);

  return <section className="panel score-panel credits-leaderboard">
    <PanelHead title="Xếp hạng credits" />
    {error && <div className="credits-rank-status" role="status">
      <span>{error}</span>
      <Button variant="secondary" onClick={() => setRetry(current => current + 1)}>Thử lại</Button>
    </div>}
    {!ranking && !error && <p className="credits-rank-status" role="status">Đang tải bảng xếp hạng</p>}
    {ranking && (ranking.rows.length > 0 ? <table className="scoreboard-table credits-rank-table" aria-label="Bảng xếp hạng credits">
      <thead><tr>
        <th className="score-rank-column" scope="col">Hạng</th>
        <th scope="col">Thành viên</th>
        <th className="score-numeric" scope="col" aria-sort="descending">Credits</th>
      </tr></thead>
      <tbody>
        {ranking.rows.map((row, index) => {
          const member = identity?.members.get(row.memberId);
          const name = member?.name ?? row.name;
          const ownRow = row.memberId === memberId;
          return <tr key={row.memberId} data-self={ownRow || undefined}>
            <td className="score-rank-column"><RankNumber rank={row.rank} /></td>
            <td><div className="score-person">
              <Avatar name={name} memberId={row.memberId} photoId={member?.avatarId} index={index} size="small" />
              <span className="credits-rank-name">
                <MemberName as="strong" memberId={row.memberId} name={name} />
                {ownRow && <small className="score-self">Bạn</small>}
              </span>
            </div></td>
            <td className="score-numeric"><strong>{formatCredits(row.balanceCents)}</strong></td>
          </tr>;
        })}
      </tbody>
    </table> : <p className="credits-rank-status">Chưa có thành viên trong bảng xếp hạng</p>)}
  </section>;
}
