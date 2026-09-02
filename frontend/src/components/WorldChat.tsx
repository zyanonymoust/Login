import { useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { API_BASE_URL, apiRequest } from "../services/api";
import "./WorldChat.css";

type WorldReaction = { emoji: string; count: number; reactedByMe?: boolean };
type WorldMessage = {
  id: number;
  senderId: number;
  senderName: string;
  senderAvatarUrl?: string;
  channel: string;
  content: string;
  sentAt: string;
  isAdmin: boolean;
  attachmentName?: string;
  attachmentContentType?: string;
  attachmentUrl?: string;
  replyTo?: {
    id: number;
    senderId: number;
    senderName: string;
    content: string;
  };
  reactions: WorldReaction[];
  clientMessageId?: string;
  isPinned?: boolean;
  pinnedUntil?: string;
};
type WorldAnnouncement = {
  id: number;
  content: string;
  createdAt: string;
  expiresAt?: string;
  createdBy?: string;
};
type WorldState = {
  channels: string[];
  announcement: string;
  announcements: WorldAnnouncement[];
  slowModeSeconds: number;
  onlineCount: number;
  mutedUntil?: string;
  muteReason?: string;
  blockedIds: number[];
  worldChatDoNotDisturb?: boolean;
};
type Report = {
  id: number;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  worldMessageId?: number;
  reporterName: string;
  reportedUserId: number;
  reportedName: string;
};
type AdminUser = {
  id: number;
  name: string;
  isAdmin: boolean;
  isOwner: boolean;
  status: string;
  mustChangePassword: boolean;
};
type Props = {
  me: { id?: number; userId?: number; name: string; isAdmin?: boolean };
};

const channelLabels: Record<string, string> = {
  general: "🌍 General",
  gaming: "🎮 Gaming",
  technology: "💻 Technology",
  music: "🎵 Music",
  movies: "🎬 Movies",
  study: "📚 Study",
};
const emojis = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export default function WorldChat({ me }: Props) {
  const myId = me.id || me.userId || 0;
  const [state, setState] = useState<WorldState>({
    channels: Object.keys(channelLabels),
    announcement: "",
    announcements: [],
    slowModeSeconds: 5,
    onlineCount: 0,
    blockedIds: [],
  });
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [slowModeDraft, setSlowModeDraft] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);
  const [adminAnnouncements, setAdminAnnouncements] = useState<
    WorldAnnouncement[]
  >([]);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<
    number | null
  >(null);
  const [expiryDraft, setExpiryDraft] = useState("");
  const [pinMenuId, setPinMenuId] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const connectionRef = useRef<HubConnection | null>(null);
  const channelRef = useRef(channel);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pinnedRef = useRef(true);
  const announcementScrollRef = useRef<HTMLDivElement>(null);
  const announcementReturnRef = useRef<number | null>(null);

  const loadState = async () =>
    setState(await apiRequest<WorldState>("/api/world/state"));
  const loadMessages = async (activeChannel: string) => {
    const rows = await apiRequest<WorldMessage[]>(
      `/api/world/messages?channel=${activeChannel}&limit=50`,
    );
    setMessages(rows);
    setHasOlder(rows.length === 50);
    pinnedRef.current = true;
  };

  useEffect(() => {
    void loadState();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
      void loadState();
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    channelRef.current = channel;
    setReply(null);
    setError("");
    void loadMessages(channel).catch((e) =>
      setError(e instanceof Error ? e.message : "World Chat could not load."),
    );
    connectionRef.current
      ?.invoke("JoinWorldChannel", channel)
      .catch(() => undefined);
  }, [channel]);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const connection = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/chat`, {
        accessTokenFactory: () => token,
        withCredentials: false,
      })
      .withAutomaticReconnect([0, 1500, 5000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();
    connection.on("WorldMessageReceived", (message: WorldMessage) => {
      if (message.channel !== channelRef.current) return;
      setMessages((items) =>
        items.some((item) => item.id === message.id)
          ? items
          : [...items, message],
      );
    });
    connection.on("WorldMessageDeleted", ({ id }: { id: number }) =>
      setMessages((items) => items.filter((item) => item.id !== id)),
    );
    connection.on(
      "WorldMessagePinned",
      ({
        id,
        isPinned,
        pinnedUntil,
      }: {
        id: number;
        isPinned: boolean;
        pinnedUntil?: string;
      }) =>
        setMessages((items) =>
          items.map((item) =>
            item.id === id ? { ...item, isPinned, pinnedUntil } : item,
          ),
        ),
    );
    connection.on(
      "WorldReactionsChanged",
      ({ id, reactions }: { id: number; reactions: WorldReaction[] }) =>
        setMessages((items) =>
          items.map((item) => (item.id === id ? { ...item, reactions } : item)),
        ),
    );
    connection.on("WorldOnlineCount", ({ count }: { count: number }) =>
      setState((current) => ({ ...current, onlineCount: count })),
    );
    connection.on(
      "WorldSettingsChanged",
      (settings: { announcement: string; slowModeSeconds: number }) =>
        setState((current) => ({ ...current, ...settings })),
    );
    connection.on("WorldAnnouncementsChanged", () => {
      void loadState();
    });
    connection.on("WorldMuteChanged", () => void loadState());
    connection.on(
      "AdminPermissionChanged",
      ({ isAdmin }: { isAdmin: boolean }) => {
        setAdminEnabled(isAdmin);
        if (!isAdmin) setAdminOpen(false);
      },
    );
    connection.onreconnecting(() => {
      setConnected(false);
      setError("Global Channel disconnected. Reconnecting…");
    });
    connection.onreconnected(() => {
      setConnected(true);
      setError("");
      void connection.invoke("JoinWorldChannel", channelRef.current);
    });
    let stopped = false;
    const start = async () => {
      while (!stopped) {
        try {
          await connection.start();
          connectionRef.current = connection;
          setConnected(true);
          setError("");
          await connection.invoke("JoinWorldChannel", channelRef.current);
          return;
        } catch {
          setConnected(false);
          setError(
            "Global Channel is unavailable. Woven will retry automatically.",
          );
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
        }
      }
    };
    void start();
    return () => {
      stopped = true;
      connectionRef.current = null;
      void connection.stop();
    };
  }, []);
  useEffect(() => {
    if (!pinnedRef.current) return;
    requestAnimationFrame(() =>
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      }),
    );
  }, [messages]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await apiRequest<WorldMessage>("/api/world/messages", {
        method: "POST",
        body: JSON.stringify({
          channel,
          content,
          replyToId: reply?.id,
          clientMessageId: crypto.randomUUID(),
        }),
      });
      setMessages((items) =>
        items.some((item) => item.id === message.id)
          ? items
          : [...items, message],
      );
      setDraft("");
      setReply(null);
      pinnedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };
  const loadOlder = async () => {
    const first = messages[0];
    const list = listRef.current;
    if (!first || !list || loadingOlder || !hasOlder) return;
    const height = list.scrollHeight;
    setLoadingOlder(true);
    try {
      const rows = await apiRequest<WorldMessage[]>(
        `/api/world/messages?channel=${channel}&before=${first.id}&limit=50`,
      );
      setMessages((items) => [...rows, ...items]);
      setHasOlder(rows.length === 50);
      requestAnimationFrame(() => {
        if (listRef.current)
          listRef.current.scrollTop = listRef.current.scrollHeight - height;
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Older messages could not be loaded.",
      );
    } finally {
      setLoadingOlder(false);
    }
  };
  const react = async (message: WorldMessage, emoji: string) => {
    await apiRequest(`/api/world/messages/${message.id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  };
  const pin = async (message: WorldMessage, days: 0 | 1 | 7 | 30) => {
    const result = await apiRequest<{
      id: number;
      isPinned: boolean;
      pinnedUntil?: string;
    }>(`/api/world/messages/${message.id}/pin`, {
      method: "PUT",
      body: JSON.stringify({ days }),
    });
    setMessages((items) =>
      items.map((item) =>
        item.id === result.id
          ? {
              ...item,
              isPinned: result.isPinned,
              pinnedUntil: result.pinnedUntil,
            }
          : item,
      ),
    );
    setPinMenuId(null);
  };
  const remove = async (message: WorldMessage) => {
    if (!confirm("Delete this Global Channel message?")) return;
    await apiRequest(`/api/world/messages/${message.id}`, { method: "DELETE" });
    setMessages((items) => items.filter((item) => item.id !== message.id));
  };
  const report = async (message: WorldMessage) => {
    const details = prompt("Describe why you are reporting this message", "");
    if (details === null) return;
    await apiRequest("/api/world/reports", {
      method: "POST",
      body: JSON.stringify({
        reportedUserId: message.senderId,
        worldMessageId: message.id,
        reason: "other",
        details,
      }),
    });
    alert("Your report was sent to the administrators.");
  };
  const block = async (message: WorldMessage) => {
    if (!confirm(`Block ${message.senderName}?`)) return;
    await apiRequest(`/api/social/blocks/${message.senderId}`, {
      method: "POST",
    });
    setMessages((items) =>
      items.filter((item) => item.senderId !== message.senderId),
    );
    setState((current) => ({
      ...current,
      blockedIds: [...current.blockedIds, message.senderId],
    }));
  };
  const mute = async (message: WorldMessage) => {
    const value = prompt(
      "Mute duration in minutes: 10, 60, or 1440. Use -1 for permanent and 0 to unmute.",
      "10",
    );
    if (value === null) return;
    const minutes = Number(value);
    if (!Number.isInteger(minutes)) return;
    const reason =
      prompt("Reason for mute", "Global Channel rules violation") ||
      "Global Channel rules violation";
    await apiRequest(`/api/world/admin/mutes/${message.senderId}`, {
      method: "PUT",
      body: JSON.stringify({ minutes, reason }),
    });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      setError("Files must be 10 MB or smaller.");
      return;
    }
    const body = new FormData();
    body.append("channel", channel);
    body.append("file", file);
    if (draft.trim()) body.append("caption", draft.trim());
    if (reply) body.append("replyToId", String(reply.id));
    setSending(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/api/world/messages/attachment`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body,
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Attachment could not be sent.",
        );
      const message = (await response.json()) as WorldMessage;
      setMessages((items) =>
        items.some((item) => item.id === message.id)
          ? items
          : [...items, message],
      );
      setDraft("");
      setReply(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Attachment could not be sent.",
      );
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const openAdmin = async () => {
    setAdminOpen((value) => !value);
    if (!adminOpen) {
      setReports(await apiRequest<Report[]>("/api/world/admin/reports"));
      if (myId === 1 || myId === 2)
        setAdminUsers(await apiRequest<AdminUser[]>("/api/world/owner/admins"));
    }
  };
  const loadAdminAnnouncements = async () =>
    setAdminAnnouncements(
      await apiRequest<WorldAnnouncement[]>("/api/world/admin/announcements"),
    );
  const openSettings = () => {
    setAnnouncementDraft("");
    setEditingAnnouncementId(null);
    setExpiryDraft("");
    setSlowModeDraft(state.slowModeSeconds);
    setSettingsOpen(true);
    void loadAdminAnnouncements();
  };
  const editAnnouncement = (item: WorldAnnouncement) => {
    setEditingAnnouncementId(item.id);
    setAnnouncementDraft(item.content);
    setExpiryDraft(
      item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 16) : "",
    );
    setSettingsOpen(true);
    void loadAdminAnnouncements();
  };
  const toggleWorldDnd = async () => {
    const enabled = !state.worldChatDoNotDisturb;
    await apiRequest("/api/world/dnd", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    setState((current) => ({ ...current, worldChatDoNotDisturb: enabled }));
  };
  const saveSettings = async () => {
    setSavingSettings(true);
    setError("");
    try {
      const slow = await apiRequest<{ slowModeSeconds: number }>(
        "/api/world/admin/slow-mode",
        {
          method: "PUT",
          body: JSON.stringify({
            seconds: Math.max(0, Math.min(120, slowModeDraft)),
          }),
        },
      );
      if (announcementDraft.trim())
        await apiRequest(
          `/api/world/admin/announcements${editingAnnouncementId ? `/${editingAnnouncementId}` : ""}`,
          {
            method: editingAnnouncementId ? "PUT" : "POST",
            body: JSON.stringify({
              content: announcementDraft.trim(),
              expiresAt: expiryDraft
                ? new Date(expiryDraft).toISOString()
                : null,
            }),
          },
        );
      setState((current) => ({ ...current, ...slow }));
      await loadState();
      await loadAdminAnnouncements();
      setAnnouncementDraft("");
      setEditingAnnouncementId(null);
      setExpiryDraft("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Global Channel settings could not be saved.",
      );
    } finally {
      setSavingSettings(false);
    }
  };
  const deleteAnnouncement = async (id: number) => {
    await apiRequest(`/api/world/admin/announcements/${id}`, {
      method: "DELETE",
    });
    await loadState();
    await loadAdminAnnouncements();
    if (editingAnnouncementId === id) {
      setEditingAnnouncementId(null);
      setAnnouncementDraft("");
      setExpiryDraft("");
    }
  };
  const review = async (item: Report, status: "resolved" | "dismissed") => {
    await apiRequest(`/api/world/admin/reports/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setReports((items) =>
      items.map((reportItem) =>
        reportItem.id === item.id ? { ...reportItem, status } : reportItem,
      ),
    );
  };
  const setAdminPermission = async (user: AdminUser) => {
    const result = await apiRequest<{
      id: number;
      name: string;
      isAdmin: boolean;
    }>(`/api/world/owner/admins/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: !user.isAdmin }),
    });
    setAdminUsers((items) =>
      items.map((item) =>
        item.id === result.id ? { ...item, isAdmin: result.isAdmin } : item,
      ),
    );
  };
  const resetPassword = async (user: AdminUser) => {
    if (
      !confirm(
        `Reset ${user.name}'s password to the temporary password 123456?`,
      )
    )
      return;
    const result = await apiRequest<{
      id: number;
      name: string;
      temporaryPassword: string;
      mustChangePassword: boolean;
    }>(`/api/world/owner/users/${user.id}/reset-password`, { method: "PUT" });
    setAdminUsers((items) =>
      items.map((item) =>
        item.id === result.id
          ? { ...item, mustChangePassword: result.mustChangePassword }
          : item,
      ),
    );
    alert(
      `${result.name}'s temporary password is ${result.temporaryPassword}. They must change it after signing in.`,
    );
  };

  return (
    <section className="world-chat">
      <header className="world-header">
        <div>
          <span className={connected ? "world-live" : "world-offline"} />{" "}
          <strong>Global Channel</strong>
          <small>
            {state.onlineCount} online ·{" "}
            {state.worldChatDoNotDisturb
              ? "notifications muted"
              : "notifications on"}
          </small>
        </div>
        <span className="world-header-actions">
          <button
            onClick={() => void toggleWorldDnd()}
            title={
              state.worldChatDoNotDisturb
                ? "Turn Global Channel notifications on"
                : "Mute Global Channel notifications"
            }
            aria-label="Global Channel notification preference"
          >
            {state.worldChatDoNotDisturb ? "🔕" : "🔔"}
          </button>
          {adminEnabled && <button onClick={openAdmin}>🛡 Manage</button>}
        </span>
      </header>
      <div
        className="world-announcement-stack"
        ref={announcementScrollRef}
        onScroll={() => {
          if (announcementReturnRef.current)
            window.clearTimeout(announcementReturnRef.current);
          announcementReturnRef.current = window.setTimeout(
            () =>
              announcementScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              }),
            5000,
          );
        }}
      >
        {state.announcements
          .filter(
            (item) =>
              !item.expiresAt || new Date(item.expiresAt).getTime() > clock,
          )
          .map((item) => (
            <div className="world-announcement" key={item.id}>
              <b>📢 Announcement</b>
              <span>
                {item.content}
                {adminEnabled && item.expiresAt && (
                  <small>
                    Ends {new Date(item.expiresAt).toLocaleString()}
                  </small>
                )}
              </span>
              {adminEnabled && (
                <button onClick={() => editAnnouncement(item)}>Edit</button>
              )}
            </div>
          ))}
      </div>
      {state.muteReason && (
        <div className="world-muted">
          🔇 You cannot post right now: {state.muteReason}
        </div>
      )}
      {error && (
        <div className="world-error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {messages.some(
        (item) =>
          item.isPinned &&
          (!item.pinnedUntil || new Date(item.pinnedUntil).getTime() > clock),
      ) && (
        <div className="world-pinned">
          <b>📌 Pinned</b>
          <span>
            {messages
              .filter(
                (item) =>
                  item.isPinned &&
                  (!item.pinnedUntil ||
                    new Date(item.pinnedUntil).getTime() > clock),
              )
              .slice(-3)
              .reverse()
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    document
                      .getElementById(`world-message-${item.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                >
                  {item.senderName}: {item.content || item.attachmentName}
                  <small>
                    {item.pinnedUntil
                      ? `Until ${new Date(item.pinnedUntil).toLocaleDateString()}`
                      : ""}
                  </small>
                </button>
              ))}
          </span>
        </div>
      )}
      {adminOpen && (
        <aside className="world-admin">
          <header>
            <strong>Administration</strong>
            <button onClick={openSettings}>Announcement and slow mode</button>
          </header>
          {(myId === 1 || myId === 2) && (
            <section className="world-permissions">
              <h4>User permissions and passwords</h4>
              {adminUsers.map((user) => (
                <div key={user.id}>
                  <span>
                    <b>{user.name}</b>
                    <small>
                      #{user.id} ·{" "}
                      {user.isOwner
                        ? "Owner"
                        : user.isAdmin
                          ? "Admin"
                          : "Member"}
                      {user.mustChangePassword
                        ? " · Password change required"
                        : ""}
                    </small>
                  </span>
                  {user.isOwner ? (
                    <em>Permanent Owner</em>
                  ) : (
                    <div className="world-user-actions">
                      <button onClick={() => setAdminPermission(user)}>
                        {user.isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                      <button onClick={() => resetPassword(user)}>
                        Reset password
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
          <h4>Report review</h4>
          {reports.length === 0 ? (
            <p>No reports right now.</p>
          ) : (
            reports.map((item) => (
              <article key={item.id}>
                <div>
                  <b>{item.reportedName}</b>
                  <span>
                    {item.reason} · Reported by {item.reporterName}
                  </span>
                  <small>{item.details || "No additional details"}</small>
                </div>
                <em>{item.status}</em>
                {item.status === "open" && (
                  <div>
                    <button onClick={() => review(item, "resolved")}>
                      Resolve
                    </button>
                    <button onClick={() => review(item, "dismissed")}>
                      Dismiss
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
        </aside>
      )}
      <div
        className="world-message-list"
        ref={listRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinnedRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            30;
          if (element.scrollTop < 60) void loadOlder();
        }}
      >
        {hasOlder && (
          <button
            className="world-load-older"
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? "Loading…" : "Load older messages"}
          </button>
        )}
        {!messages.length && (
          <div className="world-empty">
            <span>🌍</span>
            <strong>Start the public conversation</strong>
            <p>Every signed-in Woven user can read and reply here.</p>
          </div>
        )}
        {messages.map((message) => (
          <article
            id={`world-message-${message.id}`}
            className={`world-message ${message.senderId === myId ? "mine" : ""}`}
            key={message.id}
          >
            <div className="world-avatar">
              {message.senderAvatarUrl ? (
                <img src={`${API_BASE_URL}${message.senderAvatarUrl}`} alt="" />
              ) : (
                message.senderName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="world-message-body">
              <header>
                <strong>{message.senderName}</strong>
                {message.isAdmin && <b>ADMIN</b>}
                <time>{new Date(message.sentAt).toLocaleString()}</time>
              </header>
              {message.replyTo && (
                <div className="world-reply">
                  <b>{message.replyTo.senderName}</b>
                  {message.replyTo.content}
                </div>
              )}
              <p>{message.content}</p>
              {message.attachmentUrl && <WorldAttachment message={message} />}
              <div className="world-reactions">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    onClick={() => react(message, reaction.emoji)}
                  >
                    {reaction.emoji} {reaction.count}
                  </button>
                ))}
              </div>
              <footer>
                <button onClick={() => setReply(message)}>Reply</button>
                {emojis.slice(0, 3).map((emoji) => (
                  <button key={emoji} onClick={() => react(message, emoji)}>
                    {emoji}
                  </button>
                ))}
                {adminEnabled && (
                  <span className="pin-duration-wrap">
                    <button
                      onClick={() =>
                        message.isPinned
                          ? void pin(message, 0)
                          : setPinMenuId(
                              pinMenuId === message.id ? null : message.id,
                            )
                      }
                    >
                      {message.isPinned ? "Unpin" : "Pin"}
                    </button>
                    {pinMenuId === message.id && (
                      <span className="pin-duration-menu">
                        <button onClick={() => void pin(message, 1)}>
                          1 day
                        </button>
                        <button onClick={() => void pin(message, 7)}>
                          1 week
                        </button>
                        <button onClick={() => void pin(message, 30)}>
                          1 month
                        </button>
                      </span>
                    )}
                  </span>
                )}
                {message.senderId !== myId && (
                  <>
                    <button onClick={() => report(message)}>Report</button>
                    <button onClick={() => block(message)}>Block</button>
                  </>
                )}
                {adminEnabled && message.senderId > 2 && (
                  <button onClick={() => mute(message)}>Mute</button>
                )}
                {(message.senderId === myId || adminEnabled) && (
                  <button onClick={() => remove(message)}>Delete</button>
                )}
              </footer>
            </div>
          </article>
        ))}
      </div>
      <div className="world-composer">
        {reply && (
          <div className="world-replying">
            <span>
              Reply to {reply.senderName}: {reply.content}
            </span>
            <button onClick={() => setReply(null)}>×</button>
          </div>
        )}
        <button onClick={() => fileRef.current?.click()} disabled={sending}>
          ＋
        </button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt,.zip"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Message everyone…"
          maxLength={2000}
          disabled={!!state.muteReason}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          aria-label="Send public message"
        >
          ↑
        </button>
      </div>
      {settingsOpen && (
        <div
          className="world-settings-backdrop"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <form
            className="world-settings-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveSettings();
            }}
          >
            <header>
              <div>
                <small>GLOBAL CHANNEL</small>
                <h3>Announcement manager</h3>
              </div>
              <div className="announcement-header-actions">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>
            <label>
              <span>
                {editingAnnouncementId
                  ? "Edit announcement"
                  : "New announcement"}
              </span>
              <textarea
                value={announcementDraft}
                onChange={(event) => setAnnouncementDraft(event.target.value)}
                maxLength={1000}
                placeholder="Write an announcement for everyone…"
              />
              <small>{announcementDraft.length}/1000</small>
            </label>
            <label>
              <span>Expires</span>
              <input
                type="datetime-local"
                value={expiryDraft}
                onChange={(event) => setExpiryDraft(event.target.value)}
              />
              <small>
                Leave empty to keep this announcement until you delete it.
              </small>
            </label>
            <label>
              <span>Slow mode</span>
              <div className="slow-mode-input">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={slowModeDraft}
                  onChange={(event) =>
                    setSlowModeDraft(Number(event.target.value))
                  }
                />
                <b>seconds</b>
              </div>
              <small>Use 0 to allow messages without a delay.</small>
            </label>
            {adminAnnouncements.length > 0 && (
              <section className="announcement-manager-list">
                <h4>All announcements</h4>
                {adminAnnouncements.map((item) => (
                  <article
                    className={
                      item.expiresAt && new Date(item.expiresAt) <= new Date()
                        ? "expired"
                        : ""
                    }
                    key={item.id}
                  >
                    <div>
                      <strong>{item.content}</strong>
                      <small>
                        {item.expiresAt
                          ? `${new Date(item.expiresAt) <= new Date() ? "Expired" : "Ends"} ${new Date(item.expiresAt).toLocaleString()}`
                          : "No expiry"}
                        {item.createdBy ? ` · ${item.createdBy}` : ""}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAnnouncementId(item.id);
                        setAnnouncementDraft(item.content);
                        setExpiryDraft(
                          item.expiresAt
                            ? new Date(item.expiresAt)
                                .toISOString()
                                .slice(0, 16)
                            : "",
                        );
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="delete"
                      onClick={() => void deleteAnnouncement(item.id)}
                    >
                      Delete
                    </button>
                  </article>
                ))}
              </section>
            )}
            <footer>
              {editingAnnouncementId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAnnouncementId(null);
                    setAnnouncementDraft("");
                    setExpiryDraft("");
                  }}
                >
                  New
                </button>
              )}
              <button type="button" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
              <button type="submit" disabled={savingSettings}>
                {savingSettings
                  ? "Saving…"
                  : editingAnnouncementId
                    ? "Save changes"
                    : announcementDraft.trim()
                      ? "Publish announcement"
                      : "Save slow mode"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}

function WorldAttachment({ message }: { message: WorldMessage }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    const token = localStorage.getItem("token");
    fetch(`${API_BASE_URL}${message.attachmentUrl}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.blob() : Promise.reject()))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.attachmentUrl]);
  if (!url) return <span className="world-file">Loading attachment…</span>;
  if (message.attachmentContentType?.startsWith("image/"))
    return (
      <a className="world-image" href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={message.attachmentName || "Global Channel image"} />
      </a>
    );
  return (
    <a className="world-file" href={url} download={message.attachmentName}>
      📎 {message.attachmentName}
    </a>
  );
}
