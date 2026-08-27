import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { SubmitEvent, ChangeEvent } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { useNavigate } from "react-router";
import { API_BASE_URL, apiRequest } from "../services/api";
import { logout } from "../services/auth";
import JumpGame from "../components/JumpGame";
import GroupSpace from "../components/GroupSpace";
import "./social.css";
type Person = {
  id: number;
  name: string;
  email: string;
  bio: string;
  status: string;
  online: boolean;
  friendshipStatus?: string;
  incoming: boolean;
  unread: number;
  avatarUrl?: string;
};
type Message = {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  sentAt: string;
  readAt?: string;
  isUnread?: boolean;
  attachmentName?: string;
  attachmentContentType?: string;
  attachmentUrl?: string;
  replyTo?: { id: number; senderId: number; content: string; attachmentName?: string };
  reactions?: { emoji: string; count: number; reactedByMe?: boolean }[];
};
type Me = {
  id?: number;
  userId?: number;
  name: string;
  email: string;
  bio?: string;
  status?: string;
  avatarUrl?: string;
};
type RecentConversation = { kind: "person" | "group"; id: number; name: string; preview: string; activityAt: string; memberCount: number };
type AppNotification = { id: number; type: string; title: string; body: string; targetKind: "person" | "group"; targetId: number; isRead: boolean; createdAt: string };
export type GroupRoom = { id:number; name:string; description:string; isPublic:boolean; status:string; role:string; isMuted:boolean; doNotDisturb:boolean; memberCount:number; invitedBy:string; createdAt:string };
export default function Dashboard() {
  const fileInput = useRef<HTMLInputElement>(null),
    chatHubRef = useRef<HubConnection | null>(null),
    messageListRef = useRef<HTMLDivElement>(null),
    pinnedToLatestRef = useRef(true),
    autoAwayRef = useRef(false);
  const nav = useNavigate(),
    [me, setMe] = useState<Me>(() =>
      JSON.parse(localStorage.getItem("user") || "{}"),
    ),
    [people, setPeople] = useState<Person[]>([]),
    [selected, setSelected] = useState<Person | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [messageDetails, setMessageDetails] = useState<Message | null>(null),
    [replyingTo, setReplyingTo] = useState<Message | null>(null),
    [isTyping, setIsTyping] = useState(false),
    [conversationMuted, setConversationMuted] = useState(false),
    [chatSearch, setChatSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [chatError, setChatError] = useState(""),
    [showLatestButton, setShowLatestButton] = useState(false),
    [uploading, setUploading] = useState(false),
    [groupRooms, setGroupRooms] = useState<GroupRoom[]>([]),
    [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]),
    [notifications, setNotifications] = useState<AppNotification[]>([]),
    [selectedGroupId, setSelectedGroupId] = useState<number | null>(null),
    [view, setView] = useState<"chat" | "home" | "groups" | "profile" | "settings">(
      "home",
    ),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(false),
    [theme, setTheme] = useState(
      () => localStorage.getItem("woven-theme") || "violet",
    ),
    [darkMode, setDarkMode] = useState(
      () => localStorage.getItem("woven-dark") === "on",
    ),
    [desktopNotifications, setDesktopNotifications] = useState(
      () => localStorage.getItem("woven-desktop-notifications") === "on",
    ),
    [chatBg, setChatBg] = useState(
      () => localStorage.getItem("woven-chat-bg") || "default",
    ),
    [pointerEffect, setPointerEffect] = useState(
      () => localStorage.getItem("woven-pointer-effect") || "default",
    ),
    [friendshipStreak] = useState(updateActivityStreak);
  const selectedId = selected?.id;
  const refresh = useCallback(async () => {
    try {
      const d = await apiRequest<Person[]>("/api/social/people");
      setPeople(d);
      setSelected((s) => (s ? d.find((x) => x.id === s.id) || null : s));
    } catch {
      return;
    }
  }, []);
  const refreshGroups = useCallback(async () => {
    try { setGroupRooms(await apiRequest<GroupRoom[]>("/api/groups")); } catch { return; }
  }, []);
  const refreshRecent = useCallback(async () => {
    try { setRecentConversations(await apiRequest<RecentConversation[]>("/api/messages/recent")); } catch { return; }
  }, []);
  const refreshNotifications = useCallback(async () => {
    try { setNotifications(await apiRequest<AppNotification[]>("/api/notifications")); } catch { return; }
  }, []);
  useEffect(() => {
    apiRequest<Me>("/api/auth/me")
      .then(setMe)
      .catch(() => {});
    refresh(); refreshGroups(); refreshRecent(); refreshNotifications();
    apiRequest("/api/social/heartbeat", { method: "POST" }).catch(() => {});
    const t = setInterval(() => {
      refresh();
      apiRequest("/api/social/heartbeat", { method: "POST" }).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [refresh, refreshGroups, refreshRecent, refreshNotifications]);
  useEffect(() => {
    if (!selectedId) return;
    let a = true;
    apiRequest<Message[]>(`/api/messages/${selectedId}`)
      .then((d) => a && setMessages(d))
      .catch(() => {});
    return () => {
      a = false;
    };
  }, [selectedId]);
  useEffect(() => {
    pinnedToLatestRef.current = true;
    setShowLatestButton(false);
    setChatError("");
  }, [selected?.id]);
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const frame = window.requestAnimationFrame(() => {
      if (pinnedToLatestRef.current) {
        list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
        setShowLatestButton(false);
      } else {
        setShowLatestButton(list.scrollHeight - list.scrollTop - list.clientHeight > 24);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    apiRequest<{ muted: boolean }>(`/api/messages/${selectedId}/preference`).then((result) => setConversationMuted(result.muted)).catch(() => setConversationMuted(false));
  }, [selectedId]);
  useEffect(() => localStorage.setItem("woven-theme", theme), [theme]);
  useEffect(() => localStorage.setItem("woven-dark", darkMode ? "on" : "off"), [darkMode]);
  useEffect(() => localStorage.setItem("woven-chat-bg", chatBg), [chatBg]);
  useEffect(() => {
    localStorage.setItem("woven-pointer-effect", pointerEffect);
    if (pointerEffect === "default" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lastPaint = 0;
    const paint = (event: PointerEvent) => {
      if (event.pointerType === "touch" || performance.now() - lastPaint < 14) return;
      lastPaint = performance.now();
      const particle = document.createElement("i");
      particle.className = `pointer-particle ${pointerEffect}`;
      particle.style.left = `${event.clientX}px`;
      particle.style.top = `${event.clientY}px`;
      if (pointerEffect === "sparkles") particle.textContent = "✦";
      document.body.appendChild(particle);
      window.setTimeout(() => particle.remove(), 800);
    };
    window.addEventListener("pointermove", paint, { passive: true });
    return () => {
      window.removeEventListener("pointermove", paint);
      document.querySelectorAll(".pointer-particle").forEach((item) => item.remove());
    };
  }, [pointerEffect]);
  useEffect(() => {
    let timer = me.status === "Available" ? window.setTimeout(setAway, 300000) : 0;
    async function setAway() {
      const result = await apiRequest<{ status: string }>("/api/social/status", { method: "PUT", body: JSON.stringify({ status: "Away" }) }).catch(() => null);
      if (!result) return;
      autoAwayRef.current = true;
      setMe((current) => ({ ...current, status: result.status }));
    }
    async function active() {
      window.clearTimeout(timer);
      if (autoAwayRef.current) {
        autoAwayRef.current = false;
        const result = await apiRequest<{ status: string }>("/api/social/status", { method: "PUT", body: JSON.stringify({ status: "Available" }) }).catch(() => null);
        if (result) setMe((current) => ({ ...current, status: result.status }));
      }
      if (me.status === "Available") timer = window.setTimeout(setAway, 300000);
    }
    const events = ["pointerdown", "keydown", "focus"] as const;
    events.forEach((event) => window.addEventListener(event, active, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, active));
    };
  }, [me.status]);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const base = import.meta.env.VITE_API_URL || "http://localhost:5436",
      c = new HubConnectionBuilder()
        .withUrl(`${base}/hubs/chat`, {
          accessTokenFactory: () => token,
          withCredentials: false,
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();
    c.on("MessageReceived", (m: Message) => {
      refresh();
      refreshRecent();
      if (
        selectedId &&
        (m.senderId === selectedId || m.recipientId === selectedId)
      )
        setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, { ...m, isUnread: true }]));
    });
    c.on("MessageSent", (m: Message) => {
      refreshRecent();
      if (
        selectedId &&
        (m.senderId === selectedId || m.recipientId === selectedId)
      )
        setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
    });
    c.on("MessagesRead", (r: { readBy: number; readAt: string }) => {
      if (selectedId === r.readBy)
        setMessages((x) =>
          x.map((m) =>
            m.recipientId === r.readBy ? { ...m, readAt: r.readAt } : m,
          ),
        );
    });
    c.on("MessageUpdated", (item: { id: number; content: string }) => {
      setMessages((items) => items.map((message) => message.id === item.id ? { ...message, content: item.content } : message));
      setMessageDetails((message) => message?.id === item.id ? { ...message, content: item.content } : message);
    });
    c.on("MessageDeleted", (item: { id: number }) => {
      setMessages((items) => items.filter((message) => message.id !== item.id));
      setMessageDetails((message) => message?.id === item.id ? null : message);
    });
    c.on("MessageReactionsChanged", (item: { id: number; reactions: { emoji: string; count: number }[]; userId: number; emoji: string; added: boolean }) => {
      setMessages((messages) => messages.map((message) => message.id === item.id ? { ...message, reactions: item.reactions.map((reaction) => ({ ...reaction, reactedByMe: item.userId === (me.id || me.userId) && reaction.emoji === item.emoji ? item.added : message.reactions?.find((old) => old.emoji === reaction.emoji)?.reactedByMe })) } : message));
    });
    c.on("TypingChanged", (item: { userId: number; isTyping: boolean }) => {
      if (item.userId === selectedId) setIsTyping(item.isTyping);
    });
    c.on("PresenceChanged", refresh);
    c.on("FriendRequestReceived", refresh);
    c.on("FriendRequestUpdated", refresh);
    c.on("GroupInviteReceived", refreshGroups);
    c.on("GroupMembershipChanged", () => { refreshGroups(); refreshRecent(); });
    c.on("NotificationReceived", () => {
      refreshNotifications();
      if (desktopNotifications && "Notification" in window && window.Notification.permission === "granted" && document.hidden) new window.Notification("Woven", { body: "You have a new notification." });
    });
    c.start().then(() => { chatHubRef.current = c; }).catch(() => {});
    return () => {
      if (chatHubRef.current === c) chatHubRef.current = null;
      c.stop().catch(() => {});
    };
  }, [selectedId, refresh, refreshGroups, refreshRecent, refreshNotifications, me.id, me.userId, desktopNotifications]);
  useEffect(() => {
    if (!selected || !chatHubRef.current) return;
    chatHubRef.current.invoke("SendTyping", selected.id, draft.trim().length > 0).catch(() => {});
    const timer = window.setTimeout(() => chatHubRef.current?.invoke("SendTyping", selected.id, false).catch(() => {}), 1200);
    return () => window.clearTimeout(timer);
  }, [draft, selected]);
  const friends = people.filter((x) => x.friendshipStatus === "accepted"),
    others = people.filter((x) => x.friendshipStatus !== "accepted"),
    incomingRequests = people.filter((x) => x.friendshipStatus === "pending" && x.incoming),
    pendingGroups = groupRooms.filter((x) => x.status === "pending"),
    unread = people.reduce((a, x) => a + x.unread, 0),
    notificationCount = notifications.filter((item) => !item.isRead).length,
    choose = (p: Person) => {
      setSelected(p);
      setReplyingTo(null);
      setView("chat");
    },
    markTargetNotifications = async (targetKind: "person" | "group", targetId: number) => {
      const matches = notifications.filter((item) => !item.isRead && item.targetKind === targetKind && item.targetId === targetId);
      await Promise.all(matches.map((item) => apiRequest(`/api/notifications/${item.id}/read`, { method: "POST" })));
      setNotifications((items) => items.map((item) => item.targetKind === targetKind && item.targetId === targetId ? { ...item, isRead: true } : item));
    },
    add = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}`, { method: "POST" });
      refresh();
    },
    acceptFriend = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}/accept`, { method: "POST" });
      await markTargetNotifications("person", p.id);
      await refresh();
    },
    declineFriend = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}`, { method: "DELETE" });
      await markTargetNotifications("person", p.id);
      await refresh();
    },
    acceptGroup = async (room: GroupRoom) => { await apiRequest(`/api/groups/${room.id}/accept`, { method: "POST" }); await markTargetNotifications("group", room.id); await refreshGroups(); },
    declineGroup = async (room: GroupRoom) => { await apiRequest(`/api/groups/${room.id}/invite`, { method: "DELETE" }); await markTargetNotifications("group", room.id); await refreshGroups(); },
    openNotification = async (item: AppNotification) => {
      if (!item.isRead) {
        await apiRequest(`/api/notifications/${item.id}/read`, { method: "POST" });
        setNotifications((items) => items.map((x) => x.id === item.id ? { ...x, isRead: true } : x));
      }
      setNotice(false);
      if (item.targetKind === "group") {
        setSelectedGroupId(item.targetId);
        setView("groups");
        return;
      }
      const person = people.find((x) => x.id === item.targetId);
      if (person) choose(person);
    },
    readAllNotifications = async () => {
      await apiRequest("/api/notifications/read-all", { method: "POST" });
      setNotifications((items) => items.map((x) => ({ ...x, isRead: true })));
    },
    changeStatus = async (status: string) => {
      const result = await apiRequest<{ status: string }>("/api/social/status", { method: "PUT", body: JSON.stringify({ status }) });
      const updated = { ...me, status: result.status };
      setMe(updated);
      localStorage.setItem("user", JSON.stringify(updated));
    },
    toggleConversationMute = async () => {
      if (!selected) return;
      const result = await apiRequest<{ muted: boolean }>(`/api/messages/${selected.id}/preference`, { method: "PUT", body: JSON.stringify({ muted: !conversationMuted }) });
      setConversationMuted(result.muted);
    },
    toggleDesktopNotifications = async () => {
      if (typeof window.Notification === "undefined") { window.alert("Desktop notifications are not supported by this browser."); return; }
      if (!desktopNotifications) {
        const permission = await window.Notification.requestPermission();
        if (permission !== "granted") return;
      }
      const enabled = !desktopNotifications;
      setDesktopNotifications(enabled);
      localStorage.setItem("woven-desktop-notifications", enabled ? "on" : "off");
    },
    editMessage = async (message: Message) => {
      const content = window.prompt("Edit message", message.content);
      if (content === null || !content.trim() || content.trim() === message.content) return;
      const updated = await apiRequest<{ id: number; content: string }>(`/api/messages/item/${message.id}`, { method: "PUT", body: JSON.stringify({ content }) });
      setMessages((items) => items.map((item) => item.id === updated.id ? { ...item, content: updated.content } : item));
      setMessageDetails((item) => item?.id === updated.id ? { ...item, content: updated.content } : item);
    },
    deleteMessage = async (message: Message) => {
      if (!window.confirm("Delete this message for both people?")) return;
      await apiRequest(`/api/messages/item/${message.id}`, { method: "DELETE" });
      setMessages((items) => items.filter((item) => item.id !== message.id));
      setMessageDetails(null);
    },
    uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/api/social/avatar`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body });
      if (!response.ok) { window.alert("Choose a PNG, JPEG, or WebP image smaller than 2 MB."); return; }
      const result = await response.json() as { avatarUrl: string };
      setMe((current) => ({ ...current, avatarUrl: result.avatarUrl }));
      event.target.value = "";
    },
    deleteAvatar = async () => {
      await apiRequest("/api/social/avatar", { method: "DELETE" });
      setMe((current) => ({ ...current, avatarUrl: undefined }));
    },
    changePassword = async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await apiRequest("/api/social/password", { method: "PUT", body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword"), confirmPassword: form.get("confirmPassword") }) });
      event.currentTarget.reset();
      window.alert("Password changed successfully.");
    },
    replyToMessage = (message: Message) => {
      setReplyingTo(message);
      setMessageDetails(null);
    },
    reactToMessage = async (message: Message, emoji: string) => {
      await apiRequest(`/api/messages/item/${message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
    },
    send = async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!selected || !draft.trim()) return;
      pinnedToLatestRef.current = true;
      setShowLatestButton(false);
      const content = draft;
      setDraft("");
      setChatError("");
      try {
        await apiRequest(`/api/messages/${selected.id}`, {
          method: "POST",
          body: JSON.stringify({ content, replyToId: replyingTo?.id }),
        });
        setReplyingTo(null);
        setMessages(await apiRequest<Message[]>(`/api/messages/${selected.id}`));
        refreshRecent();
      } catch (error) {
        setDraft(content);
        setChatError(error instanceof Error ? error.message : "The message could not be sent.");
      }
    },
    save = async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget),
        u = await apiRequest<Me>("/api/social/profile", {
          method: "PUT",
          body: JSON.stringify({
            name: f.get("name"),
            bio: f.get("bio"),
            status: f.get("status"),
          }),
        });
      setMe(u);
      localStorage.setItem("user", JSON.stringify(u));
      setView("home");
    },
    uploadBackground = (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 1_000_000) {
        window.alert("Choose an image smaller than 1 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setChatBg(String(reader.result));
      reader.readAsDataURL(file);
    },
    sendAttachment = async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selected) return;
      if (file.size > 10_000_000) {
        window.alert("Choose a file smaller than 10 MB.");
        e.target.value = "";
        return;
      }
      setUploading(true);
      pinnedToLatestRef.current = true;
      setShowLatestButton(false);
      try {
        const body = new FormData();
        body.append("file", file);
        if (draft.trim()) body.append("caption", draft.trim());
        const response = await fetch(`${API_BASE_URL}/api/messages/${selected.id}/attachment`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body,
        });
        if (!response.ok) throw new Error("Upload failed");
        setDraft("");
        const item = (await response.json()) as Message;
        setMessages((items) => items.some((x) => x.id === item.id) ? items : [...items, item]);
      } catch {
        window.alert("The file could not be sent. Please try again.");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    };
  const firstUnreadId = messages.find((message) => message.isUnread)?.id,
    trackMessageScroll = () => {
      const list = messageListRef.current;
      if (!list) return;
      const atLatest = list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
      pinnedToLatestRef.current = atLatest;
      setShowLatestButton(!atLatest);
    },
    scrollToLatest = () => {
      const list = messageListRef.current;
      if (!list) return;
      pinnedToLatestRef.current = true;
      setShowLatestButton(false);
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    };
  return (
    <div className={`woven-app theme-${theme} ${darkMode ? "dark" : ""}`}>
      <aside className="app-sidebar">
        <button className="app-logo" onClick={() => setView("home")}>
          W
        </button>
        <nav>
          <button
            aria-label="Home"
            className={view === "home" ? "active" : ""}
            onClick={() => setView("home")}
          >
            ⌂<span>Home</span>
          </button>
          <button
            aria-label="Messages"
            className={view === "chat" ? "active" : ""}
            onClick={() => selected && setView("chat")}
          >
            💬<span>Messages</span>
            {unread > 0 && <b>{unread}</b>}
          </button>
          <button aria-label="Groups" className={view === "groups" ? "active" : ""} onClick={() => setView("groups")}>
            👥<span>Groups</span>{pendingGroups.length > 0 && <b>{pendingGroups.length}</b>}
          </button>
        </nav>
        <div className="side-bottom">
          <button aria-label="Toggle dark mode" onClick={() => setDarkMode((value) => !value)} title="Toggle dark mode">
            {darkMode ? "☀" : "☾"}<span>Dark mode</span>
          </button>
          <button aria-label="Profile" onClick={() => setView("profile")}>
            ♙<span>Profile</span>
          </button>
          <button aria-label="Settings" onClick={() => setView("settings")}>
            ⚙<span>Settings</span>
          </button>
          <button
            aria-label="Sign out"
            onClick={() => {
              logout();
              nav("/");
            }}
          >
            ↪<span>Sign out</span>
          </button>
        </div>
      </aside>
      <section className="people-panel">
        <div className="panel-title">
          <h2>Woven</h2>
          <button onClick={() => setView("profile")}>＋</button>
        </div>
        <label className="search">
          ⌕{" "}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
          />
        </label>
        <div className="people-scroll">
          <Group
            title="Friends"
            people={friends.filter((x) =>
              x.name.toLowerCase().includes(query.toLowerCase()),
            )}
            selected={selected}
            choose={choose}
          />
          <Group
            title="Public"
            people={others.filter((x) =>
              x.name.toLowerCase().includes(query.toLowerCase()),
            )}
            selected={selected}
            choose={choose}
            add={add}
          />
        </div>
        <div className="my-card">
          <Avatar name={me.name} avatarUrl={me.avatarUrl} />
          <span>
            <strong>{me.name || "You"}</strong>
            <select className="my-status-select" value={me.status || "Available"} onChange={(event) => changeStatus(event.target.value)} aria-label="Your status">
              <option value="Available">Available</option><option value="Busy">Busy</option><option value="Away">Away</option><option value="Do Not Disturb">Do Not Disturb</option><option value="Invisible">Invisible</option>
            </select>
          </span>
          <i className={me.status === "Invisible" ? "offline-dot" : "online-dot"} />
        </div>
      </section>
      <main className="app-main">
        <header>
          <div>
            <small>{view === "chat" ? "CONVERSATION" : "YOUR SPACE"}</small>
            <h2>
              {view === "chat" && selected
                ? selected.name
                : view === "profile"
                  ? "Edit profile"
                  : view === "settings"
                    ? "Appearance"
                    : view === "groups"
                      ? "Groups"
                    : "Good day, " + (me.name?.split(" ")[0] || "friend")}
            </h2>
          </div>
          <div className="header-tools">
            <button onClick={() => setNotice(!notice)}>
              ♢{notificationCount > 0 && <b>{notificationCount}</b>}
                      </button>
            <Avatar name={me.name} avatarUrl={me.avatarUrl} />
            {notice && (
              <div className="notice-pop">
                <div className="notice-heading"><strong>Notifications</strong>{notificationCount > 0 && <button onClick={readAllNotifications}>Mark all read</button>}</div>
                {incomingRequests.map((x) => (
                  <div className="friend-notice" key={`friend-${x.id}`}>
                    <Avatar name={x.name} avatarUrl={x.avatarUrl} />
                    <span><strong>{x.name}</strong><small>wants to be your friend</small></span>
                    <div><button onClick={() => acceptFriend(x)}>Accept</button><button className="decline" onClick={() => declineFriend(x)}>Decline</button></div>
                  </div>
                ))}
                {pendingGroups.map((room) => (
                  <div className="friend-notice group-invite-notice" key={`group-${room.id}`}>
                    <div className="avatar">👥</div><span><strong>{room.name}</strong><small>{room.invitedBy} invited you to join</small></span>
                    <div><button onClick={() => acceptGroup(room)}>Accept</button><button className="decline" onClick={() => declineGroup(room)}>Decline</button></div>
                  </div>
                ))}
                {notifications.filter((item) => item.type === "message" || item.type === "group-message").map((item) => (
                  <button className={`message-notice notification-item ${item.isRead ? "read" : "unread"}`} key={`notification-${item.id}`} onClick={() => openNotification(item)}>
                    <strong>{item.title}</strong><span>{item.body}</span><small>{new Date(item.createdAt).toLocaleString()}</small>
                  </button>
                ))}
                {!notifications.length && !incomingRequests.length && !pendingGroups.length && (
                  <p>You're all caught up.</p>
                )}
              </div>
            )}
          </div>
        </header>
        {view === "home" && (
          <section className="home-view">
            <div className="welcome-block">
              <div>
                <span>CONNECTED TODAY</span>
                <h1>
                  Conversations that
                  <br />
                  feel <em>closer.</em>
                </h1>
                <p>
                  {friends.filter((x) => x.online).length} friends online ·{" "}
                  {unread} unread messages
                </p>
              </div>
              <div className="welcome-streak">
                <div className="friendship-streak"><span>🔥</span><strong>{friendshipStreak} day{friendshipStreak === 1 ? "" : "s"}</strong><small>Friendship streak</small></div>
              </div>
            </div>
            <div className="quick-section">
              <div className="quick-conversations">
                <div className="quick-heading">
                  <h3>Jump back in</h3>
                </div>
                <div className="quick-grid">
                  {recentConversations.map((item) => (
                    <button key={`${item.kind}-${item.id}`} onClick={() => {
                      if (item.kind === "group") {
                        setSelectedGroupId(item.id);
                        setView("groups");
                        return;
                      }
                      const person = people.find((p) => p.id === item.id);
                      if (person) choose(person);
                    }}>
                      {item.kind === "person" ? <Avatar name={item.name} /> : <span className="jump-group-avatar">👥</span>}
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.preview}</small>
                      </span>
                      <b>→</b>
                    </button>
                  ))}
                  {!recentConversations.length && (
                    <div className="empty-card">
                      <b>Your circle starts here</b>
                      <span>Add someone from Public to begin a conversation.</span>
                    </div>
                  )}
                </div>
              </div>
              <FriendshipSpark />
            </div>
            <BoredomBreak />
          </section>
        )}
        {view === "groups" && <GroupSpace rooms={groupRooms} people={people} me={me} initialRoomId={selectedGroupId} onRoomsChanged={refreshGroups} />}
        {view === "chat" && selected && (
          <section
            className={`chat-view bg-${chatBg.startsWith("data:") ? "custom" : chatBg}`}
            style={
              chatBg.startsWith("data:")
                ? {
                    backgroundImage: `linear-gradient(${darkMode ? "#090d18e8" : "#fbfafce8"},${darkMode ? "#090d18e8" : "#fbfafce8"}), url(${chatBg})`,
                  }
                : undefined
            }
          >
            <div className="chat-meta">
              <Avatar name={selected.name} avatarUrl={selected.avatarUrl} />
              <span>
                <strong>{selected.name}</strong>
                <small>
                  <i
                    className={selected.online ? "online-dot" : "offline-dot"}
                  />
                  {selected.online ? "Online now" : selected.status}
                </small>
              </span>
              <label className="chat-search"><span>⌕</span><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search messages" /></label>
              <button className="conversation-mute" onClick={toggleConversationMute} title={conversationMuted ? "Turn notifications on" : "Mute notifications"}>{conversationMuted ? "🔕" : "🔔"}</button>
            </div>
            {selected.friendshipStatus !== "accepted" && (
              <div className="friend-tip">
                <span>ⓘ</span>
                <p><strong>{selected.name} is not in your friends yet.</strong> Add them to your friends for a trusted connection.</p>
                {selected.friendshipStatus === "pending" && !selected.incoming ? <button disabled>Request sent</button> : selected.incoming ? <div><button onClick={() => acceptFriend(selected)}>Accept</button><button className="decline" onClick={() => declineFriend(selected)}>Decline</button></div> : <button onClick={() => add(selected)}>Add friend</button>}
              </div>
            )}
            <div className="message-list" ref={messageListRef} onScroll={trackMessageScroll}>
              {!messages.length && (
                <div className="start-chat">
                  <Avatar name={selected.name} avatarUrl={selected.avatarUrl} />
                  <h3>Start something good</h3>
                  <p>Say hello to {selected.name}.</p>
                </div>
              )}
              {messages.filter((message) => !chatSearch.trim() || message.content.toLowerCase().includes(chatSearch.trim().toLowerCase()) || message.attachmentName?.toLowerCase().includes(chatSearch.trim().toLowerCase())).map((m, index, visibleMessages) => {
                const day = new Date(m.sentAt),
                  previousDay = index > 0 ? new Date(visibleMessages[index - 1].sentAt) : null,
                  startsDay = !previousDay || day.toDateString() !== previousDay.toDateString();
                return (
                  <Fragment key={m.id}>
                    {m.id === firstUnreadId && <div className="unread-separator"><span>New messages</span></div>}
                    {startsDay && <div className="date-separator"><span>{chatDateLabel(day)}</span></div>}
                    <div
                      className={`message ${m.senderId === (me.id || me.userId) ? "mine" : "theirs"}`}
                      onDoubleClick={() => setMessageDetails(m)}
                      onKeyDown={(event) => event.key === "Enter" && setMessageDetails(m)}
                      role="button"
                      tabIndex={0}
                      title="Double-click for message details"
                    >
                      {m.replyTo && <div className="message-reply"><strong>{m.replyTo.senderId === (me.id || me.userId) ? "You" : selected.name}</strong><span>{m.replyTo.content || m.replyTo.attachmentName || "Attachment"}</span></div>}
                      <p>{m.content}</p>
                      {m.attachmentUrl && <MessageAttachment message={m} />}
                      {!!m.reactions?.length && <div className="message-reactions">{m.reactions.map((reaction) => <button className={reaction.reactedByMe ? "mine" : ""} key={reaction.emoji} onClick={(event) => { event.stopPropagation(); reactToMessage(m, reaction.emoji); }}>{reaction.emoji} {reaction.count}</button>)}</div>}
                      {m.senderId === (me.id || me.userId) && (
                        <small>
                          {day.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          <span className={m.readAt ? "read-state read" : "read-state"}>
                            {m.readAt ? " ✓✓ Read" : " ✓ Sent"}
                          </span>
                        </small>
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            {showLatestButton && <button className="latest-message-button" type="button" onClick={scrollToLatest} aria-label="Show newest message" title="Show newest message">↓</button>}
            {isTyping && <div className="typing-indicator"><i /><i /><i /><span>{selected.name} is typing</span></div>}
            {chatError && <div className="chat-send-error" role="alert"><span>!</span>{chatError}<button type="button" onClick={() => setChatError("")} aria-label="Dismiss message error">×</button></div>}
            <form className="composer" onSubmit={send}>
              {replyingTo && <div className="replying-preview"><span><strong>Replying to {replyingTo.senderId === (me.id || me.userId) ? "yourself" : selected.name}</strong><small>{replyingTo.content || replyingTo.attachmentName || "Attachment"}</small></span><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">×</button></div>}
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} title="Add image or file">{uploading ? "…" : "＋"}</button>
              <input ref={fileInput} className="attachment-input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={sendAttachment} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type something…"
              />
              <button className="send">↑</button>
            </form>
            {messageDetails && (
              <div className="message-detail-backdrop" onClick={() => setMessageDetails(null)}>
                <section className="message-detail-card" onClick={(event) => event.stopPropagation()}>
                  <button className="message-detail-close" onClick={() => setMessageDetails(null)}>×</button>
                  <span className="message-detail-icon">✓✓</span>
                  <h3>Message details</h3>
                  <p>{messageDetails.content || messageDetails.attachmentName || "Attachment"}</p>
                  <div className="reaction-picker">{["👍", "❤️", "😂", "😮", "😢", "🎉"].map((emoji) => <button key={emoji} onClick={() => reactToMessage(messageDetails, emoji)}>{emoji}</button>)}</div>
                  <dl>
                    <div><dt>Sent</dt><dd>{formatMessageDateTime(messageDetails.sentAt)}</dd></div>
                    <div><dt>Received</dt><dd>{formatMessageDateTime(messageDetails.sentAt)}</dd></div>
                    <div><dt>Read</dt><dd>{messageDetails.readAt ? formatMessageDateTime(messageDetails.readAt) : "Not read yet"}</dd></div>
                  </dl>
                  <div className="message-detail-actions"><button onClick={() => replyToMessage(messageDetails)}>Reply</button>{messageDetails.senderId === (me.id || me.userId) && <><button onClick={() => editMessage(messageDetails)}>Edit message</button><button className="danger" onClick={() => deleteMessage(messageDetails)}>Delete message</button></>}</div>
                </section>
              </div>
            )}
          </section>
        )}
        {view === "profile" && (<section className="profile-page">
          <form className="settings-view" onSubmit={save}>
            <div className="profile-edit">
              <Avatar name={me.name} avatarUrl={me.avatarUrl} />
              <div>
                <h3>Your profile</h3>
                <p>What friends see across Woven.</p>
              </div>
            </div>
            <div className="avatar-actions"><label>Upload avatar<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} /></label>{me.avatarUrl && <button type="button" onClick={deleteAvatar}>Remove avatar</button>}</div>
            <label>
              Display name
              <input name="name" defaultValue={me.name} required />
            </label>
            <label>
              Status
              <select name="status" defaultValue={me.status || "Available"}>
                <option value="Available">Available</option>
                <option value="Busy">Busy</option>
                <option value="Away">Away</option>
                <option value="Do Not Disturb">Do Not Disturb</option>
                <option value="Invisible">Invisible</option>
              </select>
            </label>
            <label>
              Bio
              <textarea
                name="bio"
                defaultValue={me.bio || ""}
                placeholder="A little about you…"
              />
            </label>
            <button className="save">Save changes</button>
          </form>
          <form className="settings-view password-settings" onSubmit={changePassword}><h3>Change password</h3><label>Current password<input name="currentPassword" type="password" required /></label><label>New password<input name="newPassword" type="password" minLength={6} required /></label><label>Confirm new password<input name="confirmPassword" type="password" minLength={6} required /></label><button className="save">Change password</button></form>
        </section>)}
        {view === "settings" && (
          <section className="settings-view">
            <h3>Choose your color</h3>
            <p>The theme stays on this device.</p>
            <div className="swatches">
              {["violet", "ocean", "coral", "forest"].map((x) => (
                <button
                  className={`theme-choice tone-${x} ${theme === x ? "active" : ""}`}
                  onClick={() => setTheme(x)}
                  key={x}
                >
                  <i className={x} />
                  <span>{x}</span>
                </button>
              ))}
            </div>
            <button className="dark-mode-setting" onClick={() => setDarkMode((value) => !value)}>
              <span>{darkMode ? "☀" : "☾"}</span>
              <div><strong>{darkMode ? "Use light mode" : "Use dark mode"}</strong><small>Switch the complete dashboard appearance.</small></div>
              <i className={darkMode ? "enabled" : ""} />
            </button>
            <button className="dark-mode-setting" onClick={toggleDesktopNotifications}>
              <span>🔔</span><div><strong>Desktop notifications</strong><small>Show a notification when Woven is in the background.</small></div><i className={desktopNotifications ? "enabled" : ""} />
            </button>
            <div className="pointer-settings">
              <h3>Pointer style</h3>
              <p>Choose an effect that follows your mouse.</p>
              <div className="pointer-options">
                {[
                  ["default", "↖", "Default"],
                  ["meteor", "☄", "Meteor tail"],
                  ["sparkles", "✦", "Sparkles"],
                  ["glow", "●", "Soft glow"],
                ].map(([value, icon, label]) => (
                  <button
                    type="button"
                    className={pointerEffect === value ? "active" : ""}
                    onClick={() => setPointerEffect(value)}
                    key={value}
                  >
                    <i className={`pointer-preview ${value}`}>{icon}</i>
                    <span>{label}</span>
                    {pointerEffect === value && <b>✓</b>}
                  </button>
                ))}
              </div>
            </div>
            <div className="background-settings">
              <h3>Chat background</h3>
              <p>Choose a built-in style or use your own image.</p>
              <div className="background-options">
                {["default", "dusk", "grid"].map((x) => (
                  <button
                    type="button"
                    className={chatBg === x ? "active" : ""}
                    onClick={() => setChatBg(x)}
                    key={x}
                  >
                    <i className={`bg-preview ${x}`} />
                    <span>{x}</span>
                  </button>
                ))}
                <label className={chatBg.startsWith("data:") ? "active" : ""}>
                  <i
                    className="bg-preview custom"
                    style={chatBg.startsWith("data:") ? { backgroundImage: `url(${chatBg})` } : undefined}
                  />
                  <span>Custom image</span>
                  <input type="file" accept="image/*" onChange={uploadBackground} />
                </label>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) return <div className="avatar"><img src={`${API_BASE_URL}${avatarUrl}`} alt={`${name} avatar`} /></div>;
  return (
    <div className="avatar">
      {(name || "?")
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </div>
  );
}

function chatDateLabel(date: Date) {
  const today = new Date(),
    yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  const daysAgo = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (daysAgo > 1 && daysAgo < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function formatMessageDateTime(value: string) {
  return new Date(value).toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function updateActivityStreak() {
  const today = new Date(),
    key = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`,
    lastKey = localStorage.getItem("woven-streak-day"),
    previous = Number(localStorage.getItem("woven-friendship-streak") || "0");
  if (lastKey === key) return Math.max(previous, 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`,
    next = lastKey === yesterdayKey ? previous + 1 : 1;
  localStorage.setItem("woven-streak-day", key);
  localStorage.setItem("woven-friendship-streak", String(next));
  return next;
}

function MessageAttachment({ message }: { message: Message }) {
  const [url, setUrl] = useState(""),
    [preview, setPreview] = useState(false);
  useEffect(() => {
    let objectUrl = "";
    fetch(`${API_BASE_URL}${message.attachmentUrl}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [message.attachmentUrl]);

  const image = message.attachmentContentType?.startsWith("image/");
  if (!url) return <div className="attachment-loading">Loading attachment…</div>;
  if (image) return <><button type="button" className="image-attachment" onClick={() => setPreview(true)}><img src={url} alt={message.attachmentName || "Shared image"} /><span>{message.attachmentName}</span></button>{preview && <div className="image-preview-backdrop" onClick={() => setPreview(false)}><section className="image-preview-card" onClick={(event) => event.stopPropagation()}><button className="image-preview-close" onClick={() => setPreview(false)}>×</button><img src={url} alt={message.attachmentName || "Shared image"} /><footer><span>{message.attachmentName}</span><a href={url} download={message.attachmentName}>Download</a></footer></section></div>}</>;
  return <a className="file-attachment" href={url} download={message.attachmentName}><b>📎</b><span><strong>{message.attachmentName}</strong><small>Click to download</small></span></a>;
}

const conversationPrompts = [
  "Send a friend the last photo in your camera roll.",
  "Ask someone: what made you smile today?",
  "Share a song you have had on repeat lately.",
  "Tell a friend one thing you appreciate about them.",
  "Plan a tiny adventure for this weekend.",
];

function BoredomBreak() {
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const [reaction, setReaction] = useState<"idle" | "waiting" | "ready" | "finished" | "early">("idle");
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [bestReaction, setBestReaction] = useState<number | null>(null);
  const [secret, setSecret] = useState(() => Math.floor(Math.random() * 100) + 1);
  const [guess, setGuess] = useState("");
  const [guessHint, setGuessHint] = useState("Enter a number from 1 to 100.");
  const [attempts, setAttempts] = useState(0);
  const [guessCompleted, setGuessCompleted] = useState(false);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const startReaction = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setReaction("waiting");
    setReactionTime(null);
    timer.current = window.setTimeout(() => {
      startedAt.current = Date.now();
      setReaction("ready");
    }, Math.floor(Math.random() * 3000) + 2000);
  };

  const hitReaction = () => {
    if (reaction === "waiting") {
      if (timer.current) window.clearTimeout(timer.current);
      setReaction("early");
    } else if (reaction === "ready") {
      const result = Date.now() - startedAt.current;
      setReactionTime(result);
      setReaction("finished");
      setBestReaction((previous) => previous === null || result < previous ? result : previous);
    }
  };

  const reactionRating = reactionTime === null ? "" : reactionTime < 200 ? "Lightning fast!" : reactionTime < 300 ? "Excellent reaction!" : reactionTime < 400 ? "Good reaction!" : "Keep practising!";

  const checkGuess = () => {
    const value = Number(guess);
    if (guess.trim() === "" || value < 1 || value > 100) {
      setGuessHint("Please enter a number from 1 to 100.");
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (value < secret) setGuessHint("Too low. Try a higher number.");
    else if (value > secret) setGuessHint("Too high. Try a lower number.");
    else {
      setGuessHint(`Correct! You found ${secret} in ${nextAttempts} attempts.`);
      setGuessCompleted(true);
    }
    setGuess("");
  };

  const resetGuess = () => {
    setSecret(Math.floor(Math.random() * 100) + 1);
    setGuess("");
    setAttempts(0);
    setGuessCompleted(false);
    setGuessHint("A new number has been generated.");
  };

  return (
    <section className="boredom-break">
      <div className="break-heading">
        <div><span>BOREDOM BREAK</span><h3>Take two minutes for something fun.</h3></div>
        <p>Swipe or scroll to explore every game.</p>
      </div>
      <div className="game-shelf" aria-label="Mini games">
        <div className="break-grid">
          <article className="guess-card classic-guess-card">
            <div className="game-heading"><div className="game-icon">🔢</div><div><h3>Guess the Number</h3><p>Find the hidden number from 1 to 100.</p></div></div>
            <div className="guess-range"><span>1</span><div className="range-line"/><span>100</span></div>
            <div className="game-input-row"><input type="number" min="1" max="100" value={guess} disabled={guessCompleted} placeholder="Your guess" onChange={(event) => setGuess(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !guessCompleted && checkGuess()} /><button onClick={guessCompleted ? resetGuess : checkGuess}>{guessCompleted ? "New Game" : "Guess"}</button></div>
            <div className={guessCompleted ? "game-message success" : "game-message"}><p>{guessHint}</p><span>Attempts: {attempts}</span></div>
          </article>
          <article className="reaction-card classic-reaction-card">
          <div className="game-heading"><div className="game-icon">⚡</div><div><h3>Reaction Speed</h3><p>Click when the colour changes.</p></div></div>
          <div className="reaction-score"><div><span>Latest</span><strong>{reactionTime === null ? "—" : `${reactionTime} ms`}</strong></div><div><span>Best</span><strong>{bestReaction === null ? "—" : `${bestReaction} ms`}</strong></div></div>
          {reaction === "idle" && <button className="reaction-start" onClick={startReaction}>Start Reaction Test</button>}
          {reaction === "waiting" && <button className="reaction-zone waiting" onClick={hitReaction}>Wait for green...</button>}
          {reaction === "ready" && <button className="reaction-zone ready" onClick={hitReaction}>CLICK NOW!</button>}
          {reaction === "early" && <div className="reaction-result early"><strong>Too early!</strong><span>Wait until the area turns green.</span><button onClick={startReaction}>Try Again</button></div>}
          {reaction === "finished" && <div className="reaction-result finished"><strong>{reactionTime} ms</strong><span>{reactionRating}</span><button onClick={startReaction}>Play Again</button></div>}
        </article>
          <JumpGame />
        </div>
      </div>
    </section>
  );
}

function FriendshipSpark() {
  const [prompt, setPrompt] = useState(conversationPrompts[0]);
  const shufflePrompt = () => {
    const choices = conversationPrompts.filter((item) => item !== prompt);
    setPrompt(choices[Math.floor(Math.random() * choices.length)]);
  };
  return (
    <article className="friendship-spark-card">
      <div className="activity-icon">✦</div>
      <small>FRIENDSHIP SPARK</small>
      <h4>{prompt}</h4>
      <button onClick={shufflePrompt}>Give me another <span>↻</span></button>
    </article>
  );
}
function Group({
  title,
  people,
  selected,
  choose,
  add,
}: {
  title: string;
  people: Person[];
  selected: Person | null;
  choose: (p: Person) => void;
  add?: (p: Person) => void;
}) {
  return (
    <div className="people-group">
      <h4>
        {title}
        <span>{people.length}</span>
      </h4>
      {people.map((p) => (
        <div
          className={`person-row ${selected?.id === p.id ? "active" : ""}`}
          key={p.id}
        >
          <button className="person-main" onClick={() => choose(p)}>
            <span className="avatar-wrap">
              <Avatar name={p.name} avatarUrl={p.avatarUrl} />
              <i className={p.online ? "online-dot" : "offline-dot"} />
            </span>
            <span>
              <strong>{p.name}</strong>
              <small>{p.online ? "Online" : p.status || "Away"}</small>
            </span>
            {p.unread > 0 && <b>{p.unread}</b>}
          </button>
          {add && (
            <button className="add-friend" onClick={() => add(p)}>
              {p.friendshipStatus === "pending" && !p.incoming ? "…" : "＋"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
