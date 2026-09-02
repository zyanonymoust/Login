import { useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { API_BASE_URL, apiRequest } from "../services/api";
import "./WorldChat.css";

type WorldReaction = { emoji: string; count: number; reactedByMe?: boolean };
type WorldMessage = {
  id: number; senderId: number; senderName: string; senderAvatarUrl?: string; channel: string; content: string; sentAt: string; isAdmin: boolean;
  attachmentName?: string; attachmentContentType?: string; attachmentUrl?: string;
  replyTo?: { id: number; senderId: number; senderName: string; content: string };
  reactions: WorldReaction[]; clientMessageId?: string;
};
type WorldState = { channels: string[]; announcement: string; slowModeSeconds: number; onlineCount: number; mutedUntil?: string; muteReason?: string; blockedIds: number[] };
type Report = { id: number; reason: string; details: string; status: string; createdAt: string; worldMessageId?: number; reporterName: string; reportedUserId: number; reportedName: string };
type AdminUser = { id: number; name: string; isAdmin: boolean; isOwner: boolean; status: string; mustChangePassword: boolean };
type Props = { me: { id?: number; userId?: number; name: string; isAdmin?: boolean } };

const channelLabels: Record<string, string> = { general: "🌍 General", gaming: "🎮 Gaming", technology: "💻 Technology", music: "🎵 Music", movies: "🎬 Movies", study: "📚 Study" };
const emojis = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export default function WorldChat({ me }: Props) {
  const myId = me.id || me.userId || 0;
  const [state, setState] = useState<WorldState>({ channels: Object.keys(channelLabels), announcement: "", slowModeSeconds: 5, onlineCount: 0, blockedIds: [] });
  const channel = "general";
  const [messages, setMessages] = useState<WorldMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<WorldMessage | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminEnabled, setAdminEnabled] = useState(!!me.isAdmin);
  const [reports, setReports] = useState<Report[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const connectionRef = useRef<HubConnection | null>(null);
  const channelRef = useRef(channel);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pinnedRef = useRef(true);

  const loadState = async () => setState(await apiRequest<WorldState>("/api/world/state"));
  const loadMessages = async (activeChannel: string) => {
    const rows = await apiRequest<WorldMessage[]>(`/api/world/messages?channel=${activeChannel}&limit=50`);
    setMessages(rows); setHasOlder(rows.length === 50); pinnedRef.current = true;
  };

  useEffect(() => { void loadState(); }, []);
  useEffect(() => {
    channelRef.current = channel;
    setReply(null); setError("");
    void loadMessages(channel).catch((e) => setError(e instanceof Error ? e.message : "World Chat could not load."));
    connectionRef.current?.invoke("JoinWorldChannel", channel).catch(() => undefined);
  }, [channel]);
  useEffect(() => {
    const token = localStorage.getItem("token"); if (!token) return;
    const connection = new HubConnectionBuilder().withUrl(`${API_BASE_URL}/hubs/chat`, { accessTokenFactory: () => token, withCredentials: false }).withAutomaticReconnect([0, 1500, 5000, 10000]).configureLogging(LogLevel.Warning).build();
    connection.on("WorldMessageReceived", (message: WorldMessage) => {
      if (message.channel !== channelRef.current) return;
      setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
    });
    connection.on("WorldMessageDeleted", ({ id }: { id: number }) => setMessages((items) => items.filter((item) => item.id !== id)));
    connection.on("WorldReactionsChanged", ({ id, reactions }: { id: number; reactions: WorldReaction[] }) => setMessages((items) => items.map((item) => item.id === id ? { ...item, reactions } : item)));
    connection.on("WorldOnlineCount", ({ count }: { count: number }) => setState((current) => ({ ...current, onlineCount: count })));
    connection.on("WorldSettingsChanged", (settings: { announcement: string; slowModeSeconds: number }) => setState((current) => ({ ...current, ...settings })));
    connection.on("WorldMuteChanged", () => void loadState());
    connection.on("AdminPermissionChanged", ({ isAdmin }: { isAdmin: boolean }) => { setAdminEnabled(isAdmin); if (!isAdmin) setAdminOpen(false); });
    connection.onreconnecting(() => { setConnected(false); setError("Global Channel disconnected. Reconnecting…"); });
    connection.onreconnected(() => { setConnected(true); setError(""); void connection.invoke("JoinWorldChannel", channelRef.current); });
    let stopped = false;
    const start = async () => {
      while (!stopped) {
        try { await connection.start(); connectionRef.current = connection; setConnected(true); setError(""); await connection.invoke("JoinWorldChannel", channelRef.current); return; }
        catch { setConnected(false); setError("Global Channel is unavailable. Woven will retry automatically."); await new Promise((resolve) => window.setTimeout(resolve, 5000)); }
      }
    };
    void start();
    return () => { stopped = true; connectionRef.current = null; void connection.stop(); };
  }, []);
  useEffect(() => {
    if (!pinnedRef.current) return;
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }, [messages]);

  const send = async () => {
    const content = draft.trim(); if (!content || sending) return;
    setSending(true); setError("");
    try {
      const message = await apiRequest<WorldMessage>("/api/world/messages", { method: "POST", body: JSON.stringify({ channel, content, replyToId: reply?.id, clientMessageId: crypto.randomUUID() }) });
      setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]); setDraft(""); setReply(null); pinnedRef.current = true;
    } catch (e) { setError(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { setSending(false); }
  };
  const loadOlder = async () => {
    const first = messages[0]; const list = listRef.current; if (!first || !list || loadingOlder || !hasOlder) return;
    const height = list.scrollHeight; setLoadingOlder(true);
    try { const rows = await apiRequest<WorldMessage[]>(`/api/world/messages?channel=${channel}&before=${first.id}&limit=50`); setMessages((items) => [...rows, ...items]); setHasOlder(rows.length === 50); requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - height; }); }
    catch (e) { setError(e instanceof Error ? e.message : "Older messages could not be loaded."); }
    finally { setLoadingOlder(false); }
  };
  const react = async (message: WorldMessage, emoji: string) => { await apiRequest(`/api/world/messages/${message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }); };
  const remove = async (message: WorldMessage) => { if (!confirm("Delete this Global Channel message?")) return; await apiRequest(`/api/world/messages/${message.id}`, { method: "DELETE" }); setMessages((items) => items.filter((item) => item.id !== message.id)); };
  const report = async (message: WorldMessage) => { const details = prompt("Describe why you are reporting this message", ""); if (details === null) return; await apiRequest("/api/world/reports", { method: "POST", body: JSON.stringify({ reportedUserId: message.senderId, worldMessageId: message.id, reason: "other", details }) }); alert("Your report was sent to the administrators."); };
  const block = async (message: WorldMessage) => { if (!confirm(`Block ${message.senderName}?`)) return; await apiRequest(`/api/social/blocks/${message.senderId}`, { method: "POST" }); setMessages((items) => items.filter((item) => item.senderId !== message.senderId)); setState((current) => ({ ...current, blockedIds: [...current.blockedIds, message.senderId] })); };
  const mute = async (message: WorldMessage) => { const value = prompt("Mute duration in minutes: 10, 60, or 1440. Use -1 for permanent and 0 to unmute.", "10"); if (value === null) return; const minutes = Number(value); if (!Number.isInteger(minutes)) return; const reason = prompt("Reason for mute", "Global Channel rules violation") || "Global Channel rules violation"; await apiRequest(`/api/world/admin/mutes/${message.senderId}`, { method: "PUT", body: JSON.stringify({ minutes, reason }) }); };
  const upload = async (file?: File) => {
    if (!file) return; if (file.size > 10_000_000) { setError("Files must be 10 MB or smaller."); return; }
    const body = new FormData(); body.append("channel", channel); body.append("file", file); if (draft.trim()) body.append("caption", draft.trim()); if (reply) body.append("replyToId", String(reply.id));
    setSending(true);
    try { const token = localStorage.getItem("token"); const response = await fetch(`${API_BASE_URL}/api/world/messages/attachment`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body }); if (!response.ok) throw new Error((await response.json()).message || "Attachment could not be sent."); const message = await response.json() as WorldMessage; setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]); setDraft(""); setReply(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Attachment could not be sent."); } finally { setSending(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const openAdmin = async () => {
    setAdminOpen((value) => !value);
    if (!adminOpen) {
      setReports(await apiRequest<Report[]>("/api/world/admin/reports"));
      if (myId === 1 || myId === 2) setAdminUsers(await apiRequest<AdminUser[]>("/api/world/owner/admins"));
    }
  };
  const saveSettings = async () => { const announcement = prompt("Global Channel announcement", state.announcement); if (announcement === null) return; const seconds = Number(prompt("Slow mode in seconds (0–120)", String(state.slowModeSeconds))); const result = await apiRequest<{ announcement: string; slowModeSeconds: number }>("/api/world/admin/settings", { method: "PUT", body: JSON.stringify({ announcement, slowModeSeconds: seconds }) }); setState((current) => ({ ...current, ...result })); };
  const review = async (item: Report, status: "resolved" | "dismissed") => { await apiRequest(`/api/world/admin/reports/${item.id}`, { method: "PUT", body: JSON.stringify({ status }) }); setReports((items) => items.map((reportItem) => reportItem.id === item.id ? { ...reportItem, status } : reportItem)); };
  const setAdminPermission = async (user: AdminUser) => { const result = await apiRequest<{ id: number; name: string; isAdmin: boolean }>(`/api/world/owner/admins/${user.id}`, { method: "PUT", body: JSON.stringify({ enabled: !user.isAdmin }) }); setAdminUsers((items) => items.map((item) => item.id === result.id ? { ...item, isAdmin: result.isAdmin } : item)); };
  const resetPassword = async (user: AdminUser) => {
    if (!confirm(`Reset ${user.name}'s password to the temporary password 123456?`)) return;
    const result = await apiRequest<{ id: number; name: string; temporaryPassword: string; mustChangePassword: boolean }>(`/api/world/owner/users/${user.id}/reset-password`, { method: "PUT" });
    setAdminUsers((items) => items.map((item) => item.id === result.id ? { ...item, mustChangePassword: result.mustChangePassword } : item));
    alert(`${result.name}'s temporary password is ${result.temporaryPassword}. They must change it after signing in.`);
  };

  return <section className="world-chat">
    <header className="world-header"><div><span className={connected ? "world-live" : "world-offline"} /> <strong>Global Channel</strong><small>{state.onlineCount} online · available to every account</small></div>{adminEnabled && <button onClick={openAdmin}>🛡 Manage</button>}</header>
    {state.announcement && <div className="world-announcement"><b>📢 Announcement</b><span>{state.announcement}</span>{adminEnabled && <button onClick={saveSettings}>Edit</button>}</div>}
    {state.muteReason && <div className="world-muted">🔇 You cannot post right now: {state.muteReason}</div>}
    {error && <div className="world-error">{error}<button onClick={() => setError("")}>×</button></div>}
    {adminOpen && <aside className="world-admin"><header><strong>Administration</strong><button onClick={saveSettings}>Announcement and slow mode</button></header>{(myId === 1 || myId === 2) && <section className="world-permissions"><h4>User permissions and passwords</h4>{adminUsers.map((user) => <div key={user.id}><span><b>{user.name}</b><small>#{user.id} · {user.isOwner ? "Owner" : user.isAdmin ? "Admin" : "Member"}{user.mustChangePassword ? " · Password change required" : ""}</small></span>{user.isOwner ? <em>Permanent Owner</em> : <div className="world-user-actions"><button onClick={() => setAdminPermission(user)}>{user.isAdmin ? "Remove admin" : "Make admin"}</button><button onClick={() => resetPassword(user)}>Reset password</button></div>}</div>)}</section>}<h4>Report review</h4>{reports.length === 0 ? <p>No reports right now.</p> : reports.map((item) => <article key={item.id}><div><b>{item.reportedName}</b><span>{item.reason} · Reported by {item.reporterName}</span><small>{item.details || "No additional details"}</small></div><em>{item.status}</em>{item.status === "open" && <div><button onClick={() => review(item, "resolved")}>Resolve</button><button onClick={() => review(item, "dismissed")}>Dismiss</button></div>}</article>)}</aside>}
    <div className="world-message-list" ref={listRef} onScroll={(event) => { const element = event.currentTarget; pinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 30; if (element.scrollTop < 60) void loadOlder(); }}>
      {hasOlder && <button className="world-load-older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading…" : "Load older messages"}</button>}
      {!messages.length && <div className="world-empty"><span>🌍</span><strong>Start the public conversation</strong><p>Every signed-in Woven user can read and reply here.</p></div>}
      {messages.map((message) => <article className={`world-message ${message.senderId === myId ? "mine" : ""}`} key={message.id}>
        <div className="world-avatar">{message.senderAvatarUrl ? <img src={`${API_BASE_URL}${message.senderAvatarUrl}`} alt="" /> : message.senderName.charAt(0).toUpperCase()}</div>
        <div className="world-message-body"><header><strong>{message.senderName}</strong>{message.isAdmin && <b>ADMIN</b>}<time>{new Date(message.sentAt).toLocaleString()}</time></header>{message.replyTo && <div className="world-reply"><b>{message.replyTo.senderName}</b>{message.replyTo.content}</div>}<p>{message.content}</p>{message.attachmentUrl && <WorldAttachment message={message} />}
          <div className="world-reactions">{message.reactions.map((reaction) => <button key={reaction.emoji} onClick={() => react(message, reaction.emoji)}>{reaction.emoji} {reaction.count}</button>)}</div>
          <footer><button onClick={() => setReply(message)}>Reply</button>{emojis.slice(0, 3).map((emoji) => <button key={emoji} onClick={() => react(message, emoji)}>{emoji}</button>)}{message.senderId !== myId && <><button onClick={() => report(message)}>Report</button><button onClick={() => block(message)}>Block</button></>}{adminEnabled && message.senderId > 2 && <button onClick={() => mute(message)}>Mute</button>}{(message.senderId === myId || adminEnabled) && <button onClick={() => remove(message)}>Delete</button>}</footer>
        </div>
      </article>)}
    </div>
    <div className="world-composer">{reply && <div className="world-replying"><span>Reply to {reply.senderName}: {reply.content}</span><button onClick={() => setReply(null)}>×</button></div>}<button onClick={() => fileRef.current?.click()} disabled={sending}>＋</button><input ref={fileRef} hidden type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={(event) => void upload(event.target.files?.[0])} /><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Message everyone…" maxLength={2000} disabled={!!state.muteReason} /><button onClick={send} disabled={sending || !draft.trim()} aria-label="Send public message">↑</button></div>
  </section>;
}

function WorldAttachment({ message }: { message: WorldMessage }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let objectUrl = ""; const token = localStorage.getItem("token"); fetch(`${API_BASE_URL}${message.attachmentUrl}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((response) => response.ok ? response.blob() : Promise.reject()).then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => undefined); return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [message.attachmentUrl]);
  if (!url) return <span className="world-file">Loading attachment…</span>;
  if (message.attachmentContentType?.startsWith("image/")) return <a className="world-image" href={url} target="_blank" rel="noreferrer"><img src={url} alt={message.attachmentName || "Global Channel image"} /></a>;
  return <a className="world-file" href={url} download={message.attachmentName}>📎 {message.attachmentName}</a>;
}
