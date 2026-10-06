import React, { useEffect, useState } from "react";
import { DatePicker, message } from "antd";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import { checkAuthAndHandleLogout } from "./authcheck";
import ComparePanel, { type AdminOption, type GamesMap, type IGroupRow, type IUserRow } from "./ComparePanel";
import "./datatable.css";

const Compare: React.FC = () => {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [groups, setGroups] = useState<IGroupRow[]>([]);
  const [adminOptions, setAdminOptions] = useState<AdminOption[]>([]);
  const [plainUsers, setPlainUsers] = useState<IUserRow[]>([]);
  const [gamesMap, setGamesMap] = useState<GamesMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!(await checkAuthAndHandleLogout())) return;
        const [groupsRes, usersRes, gamesRes] = await Promise.all([
          apiClient.get<IGroupRow[]>("/groups"),
          apiClient.get<{ users: IUserRow[] }>("/users"),
          apiClient.get<{ gameid: number; gamename: string }[]>("/games"),
        ]);
        const admins: AdminOption[] = usersRes.data.users
          .filter((u) => u.admin_id !== null && u.user_id === u.admin_id)
          .map((u) => ({ id: u.user_id, name: u.user_name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setAdminOptions(admins);
        setPlainUsers(usersRes.data.users.filter((u) => u.user_role === "user"));
        setGroups(groupsRes.data);
        setGamesMap({
          gameIds: new Map(gamesRes.data.map((g) => [g.gamename.trim().toLowerCase().replace(/\s+/g, " "), g.gameid])),
          byNorm: new Map(gamesRes.data.map((g) => [g.gamename.trim().toLowerCase().replace(/\s+/g, " "), g])),
        });
      } catch {
        message.error("Failed to load groups");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  return (
    <div className="data-page">
      <div className="header top-nav">
        <Link to="/users">Users</Link>
        <Link to="/games">Games</Link>
        <Link to="/groups">Groups</Link>
        <Link to="/result/:gameid/:gamename">Settlement</Link>
        <Link to="/summary">Day</Link>
        <Link to="/compare" className="active">Compare</Link>
      </div>
      <div className="new-header" style={{ maxHeight: "none" }}>
        <h2>Compare groups</h2>
        <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <DatePicker value={dayjs(date)} format="DD-MM-YYYY" onChange={(d) => setDate(d?.format("YYYY-MM-DD") || date)} />
        </div>
      </div>

      {!ready || !gamesMap ? (
        <div style={{ textAlign: "center", marginTop: 20 }}>Loading…</div>
      ) : adminOptions.length < 2 ? (
        <div style={{ textAlign: "center", marginTop: 20 }}>Need at least two admin accounts to compare.</div>
      ) : (
        // Both panels always stay mounted — so a half-made pick in one is never silently lost — and
        // on a narrow screen CSS alone hides the second, rather than the page tearing it down.
        <div className="payment-summary-container settlement compare-panels">
          <ComparePanel date={date} groups={groups} adminOptions={adminOptions} plainUsers={plainUsers} gamesMap={gamesMap} />
          <ComparePanel date={date} groups={groups} adminOptions={adminOptions} plainUsers={plainUsers} gamesMap={gamesMap} className="compare-panels__second" />
        </div>
      )}
    </div>
  );
};

export default Compare;
