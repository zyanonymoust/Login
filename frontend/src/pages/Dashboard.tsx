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
  bio: string;
  status: string;
  online: boolean;
  friendshipStatus?: string;
  friendSince?: string;
  mutualGroups: number;
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
  clientMessageId?: string;
  deliveryStatus?: "sending" | "sent" | "delivered" | "failed";
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
type AppNotification = { id: number; type: string; title: string; body: string; targetKind: "person" | "group"; targetId: number; count: number; isRead: boolean; createdAt: string };
export type GroupRoom = { id:number; name:string; description:string; isPublic:boolean; status:string; role:string; isMuted:boolean; doNotDisturb:boolean; memberCount:number; invitedBy:string; createdAt:string; unread:number };
export default function Dashboard() {
  const fileInput = useRef<HTMLInputElement>(null),
    chatHubRef = useRef<HubConnection | null>(null),
    messageListRef = useRef<HTMLDivElement>(null),
    pinnedToLatestRef = useRef(true),
    autoAwayRef = useRef(false),
    selectedIdRef = useRef<number | undefined>(undefined);
  const nav = useNavigate(),
    [me, setMe] = useState<Me>(() =>
      JSON.parse(localStorage.getItem("user") || "{}"),
    ),
    [people, setPeople] = useState<Person[]>([]),
    [selected, setSelected] = useState<Person | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [hasOlderMessages, setHasOlderMessages] = useState(false),
    [loadingOlderMessages, setLoadingOlderMessages] = useState(false),
    [profilePerson, setProfilePerson] = useState<Person | null>(null),
    [liveToast, setLiveToast] = useState<{ title: string; body: string; type: string } | null>(null),
    [messageDetails, setMessageDetails] = useState<Message | null>(null),
    [replyingTo, setReplyingTo] = useState<Message | null>(null),
    [isTyping, setIsTyping] = useState(false),
    [conversationMuted, setConversationMuted] = useState(false),
    [chatSearch, setChatSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [chatError, setChatError] = useState(""),
    [sending, setSending] = useState(false),
    [showLatestButton, setShowLatestButton] = useState(false),
    [mobilePeopleOpen, setMobilePeopleOpen] = useState(false),
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
    );
  const selectedId = selected?.id;
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
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
  const handleRoomRead = useCallback((roomId: number) => {
    setGroupRooms((rooms) => rooms.map((room) => room.id === roomId ? { ...room, unread: 0 } : room));
    refreshNotifications();
  }, [refreshNotifications]);
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
      .then((d) => {
        if (!a) return;
        setMessages(d);
        setHasOlderMessages(d.length === 50);
        refresh();
        refreshNotifications();
      })
      .catch(() => {});
    return () => {
      a = false;
    };
  }, [selectedId, refresh, refreshNotifications]);
  useEffect(() => {
    pinnedToLatestRef.current = true;
    setShowLatestButton(false);
    setChatError("");
    setHasOlderMessages(false);
    setDraft(selectedId ? localStorage.getItem(`woven-draft-${selectedId}`) || "" : "");
  }, [selectedId]);
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
    if (!liveToast) return;
    const timer = window.setTimeout(() => setLiveToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [liveToast]);
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
    const base = API_BASE_URL,
      c = new HubConnectionBuilder()
        .withUrl(`${base}/hubs/chat`, {
          accessTokenFactory: () => token,
          withCredentials: false,
        })
        .withAutomaticReconnect([0, 1500, 5000, 10000, 20000])
        .configureLogging(LogLevel.Warning)
        .build();
    c.on("MessageReceived", (m: Message) => {
      refresh();
      refreshRecent();
      const activeId = selectedIdRef.current;
      if (
        activeId &&
        (m.senderId === activeId || m.recipientId === activeId)
      )
        setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, { ...m, isUnread: true }]));
    });
    c.on("MessageSent", (m: Message) => {
      refreshRecent();
      const activeId = selectedIdRef.current;
      if (
        activeId &&
        (m.senderId === activeId || m.recipientId === activeId)
      )
        setMessages((items) => {
          const optimisticIndex = m.clientMessageId
            ? items.findIndex((item) => item.clientMessageId === m.clientMessageId)
            : -1;
          if (optimisticIndex >= 0) return items.map((item, index) => index === optimisticIndex ? { ...m, deliveryStatus: "delivered" } : item);
          return items.some((item) => item.id === m.id) ? items : [...items, { ...m, deliveryStatus: "delivered" }];
        });
    });
    c.on("MessagesRead", (r: { readBy: number; readAt: string }) => {
      if (selectedIdRef.current === r.readBy)
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
      if (item.userId === selectedIdRef.current) setIsTyping(item.isTyping);
    });
    c.on("PresenceChanged", (item: { userId: number; online: boolean; status?: string }) => {
      setPeople((items) => items.map((person) => person.id === item.userId ? { ...person, online: item.online, status: item.status || person.status } : person));
    });
    c.on("FriendRequestReceived", refresh);
    c.on("FriendRequestUpdated", refresh);
    c.on("GroupInviteReceived", refreshGroups);
    c.on("GroupMembershipChanged", () => { refreshGroups(); refreshRecent(); });
    c.on("NotificationReceived", (item: { title?: string; body?: string; type?: string }) => {
      refreshNotifications();
      if (item.type === "group-message") refreshGroups();
      setLiveToast({ title: item.title || "Woven", body: item.body || "You have a new notification.", type: item.type || "activity" });
      if (desktopNotifications && "Notification" in window && window.Notification.permission === "granted" && document.hidden) new window.Notification(item.title || "Woven", { body: item.body || "You have a new notification." });
    });
    let disposed = false;
    c.onreconnecting(() => setChatError("Connection interrupted. Reconnecting…"));
    c.onreconnected(() => {
      setChatError("");
      refresh();
      refreshGroups();
      refreshNotifications();
    });
    c.onclose(() => setChatError("Real-time connection is offline. Refresh the page to reconnect."));
    chatHubRef.current = c;
    const startConnection = async () => {
      while (!disposed) {
        try {
          await c.start();
          setChatError("");
          return;
        } catch {
          setChatError("Real-time connection is offline. Woven will keep trying to reconnect.");
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
        }
      }
    };
    void startConnection();
    return () => {
      disposed = true;
      if (chatHubRef.current === c) chatHubRef.current = null;
      c.stop().catch(() => {});
    };
  }, [refresh, refreshGroups, refreshRecent, refreshNotifications, me.id, me.userId, desktopNotifications]);
  useEffect(() => {
    if (!selectedId || !chatHubRef.current) return;
    chatHubRef.current.invoke("SendTyping", selectedId, draft.trim().length > 0).catch(() => {});
    const timer = window.setTimeout(() => chatHubRef.current?.invoke("SendTyping", selectedId, false).catch(() => {}), 1200);
    return () => window.clearTimeout(timer);
  }, [draft, selectedId]);
  const friends = people.filter((x) => x.friendshipStatus === "accepted"),
    others = people.filter((x) => x.friendshipStatus !== "accepted"),
    incomingRequests = people.filter((x) => x.friendshipStatus === "pending" && x.incoming),
    pendingGroups = groupRooms.filter((x) => x.status === "pending"),
    unread = people.reduce((a, x) => a + x.unread, 0) + groupRooms.reduce((a, x) => a + x.unread, 0),
    notificationCount = notifications.filter((item) => !item.isRead && (item.type === "friend-request" || item.type === "group-invite")).length,
    choose = (p: Person) => {
      setSelected(p);
      setReplyingTo(null);
      setView("chat");
      setMobilePeopleOpen(false);
    },
    markTargetNotifications = async (targetKind: "person" | "group", targetId: number) => {
      const matches = notifications.filter((item) => !item.isRead && item.targetKind === targetKind && item.targetId === targetId);
      await Promise.all(matches.map((item) => apiRequest(`/api/notifications/${item.id}/read`, { method: "POST" })));
      setNotifications((items) => items.map((item) => item.targetKind === targetKind && item.targetId === targetId ? { ...item, isRead: true } : item));
    },
    add = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}`, { method: "POST" });
      setLiveToast({ title: "Request sent", body: `${p.name} will be notified.`, type: "friend-request-sent" });
      await refresh();
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
    readAllNotifications = async () => {
      await apiRequest("/api/notifications/read-all", { method: "POST" });
      setNotifications((items) => items.map((x) => ({ ...x, isRead: true })));
    },
    deleteReadNotifications = async () => {
      await apiRequest("/api/notifications/read", { method: "DELETE" });
      setNotifications((items) => items.filter((x) => !x.isRead));
    },
    removeFriend = async (person: Person) => {
      if (!window.confirm(`Remove ${person.name} from your friends?`)) return;
      await apiRequest(`/api/social/friends/${person.id}`, { method: "DELETE" });
      setProfilePerson(null);
      if (selected?.id === person.id) { setSelected(null); setView("home"); }
      await refresh();
    },
    requestFromProfile = async (person: Person) => {
      await add(person);
      setProfilePerson((current) => current ? { ...current, friendshipStatus: "pending", incoming: false } : current);
    },
    cancelRequestFromProfile = async (person: Person) => {
      await apiRequest(`/api/social/friends/${person.id}`, { method: "DELETE" });
      setProfilePerson((current) => current ? { ...current, friendshipStatus: undefined, incoming: false } : current);
      await refresh();
    },
    acceptFromProfile = async (person: Person) => {
      await acceptFriend(person);
      setProfilePerson((current) => current ? { ...current, friendshipStatus: "accepted", incoming: false } : current);
    },
    declineFromProfile = async (person: Person) => {
      await declineFriend(person);
      setProfilePerson(null);
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
      if (typeof window.Notification === "undefined") { window.alert("Notifications are not supported by this browser."); return; }
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
      try {
        await apiRequest(`/api/messages/item/${message.id}`, { method: "DELETE" });
        setMessages((items) => items.filter((item) => item.id !== message.id));
        setMessageDetails(null);
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "This message cannot be deleted.");
        setMessageDetails(null);
      }
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
    sendMessage = async (content: string, replyToId?: number, existingClientId?: string) => {
      if (!selectedId || sending) return;
      const clientMessageId = existingClientId || crypto.randomUUID();
      const currentUserId = me.id || me.userId || 0;
      const optimistic: Message = {
        id: -Date.now(),
        senderId: currentUserId,
        recipientId: selectedId,
        content,
        sentAt: new Date().toISOString(),
        clientMessageId,
        deliveryStatus: "sending",
      };
      pinnedToLatestRef.current = true;
      setShowLatestButton(false);
      setSending(true);
      setChatError("");
      setMessages((items) => {
        const existing = items.findIndex((item) => item.clientMessageId === clientMessageId);
        return existing >= 0
          ? items.map((item, index) => index === existing ? { ...item, deliveryStatus: "sending" } : item)
          : [...items, optimistic];
      });
      try {
        const sent = await apiRequest<Message>(`/api/messages/${selectedId}`, {
          method: "POST",
          body: JSON.stringify({ content, replyToId, clientMessageId }),
        });
        setMessages((items) => items.map((item) => item.clientMessageId === clientMessageId
          ? { ...sent, clientMessageId, deliveryStatus: item.deliveryStatus === "delivered" ? "delivered" : "sent" }
          : item));
        setReplyingTo(null);
        refreshRecent();
      } catch (error) {
        setMessages((items) => items.map((item) => item.clientMessageId === clientMessageId ? { ...item, deliveryStatus: "failed" } : item));
        setChatError(error instanceof Error ? error.message : "The message could not be sent.");
      } finally {
        setSending(false);
      }
    },
    send = async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      const content = draft.trim();
      if (!selectedId || !content || sending) return;
      const replyToId = replyingTo?.id;
      setDraft("");
      localStorage.removeItem(`woven-draft-${selectedId}`);
      await sendMessage(content, replyToId);
    },
    retryMessage = (message: Message) => sendMessage(message.content, message.replyTo?.id, message.clientMessageId),
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
    },
    loadOlderMessages = async () => {
      if (!selectedId || loadingOlderMessages || !hasOlderMessages) return;
      const firstId = messages.find((message) => message.id > 0)?.id;
      const list = messageListRef.current;
      if (!firstId || !list) return;
      const previousHeight = list.scrollHeight;
      const previousTop = list.scrollTop;
      setLoadingOlderMessages(true);
      try {
        const older = await apiRequest<Message[]>(`/api/messages/${selectedId}?before=${firstId}&limit=50`);
        setMessages((items) => [...older.filter((olderMessage) => !items.some((item) => item.id === olderMessage.id)), ...items]);
        setHasOlderMessages(older.length === 50);
        window.requestAnimationFrame(() => {
          const current = messageListRef.current;
          if (current) current.scrollTop = previousTop + current.scrollHeight - previousHeight;
        });
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "Older messages could not be loaded.");
      } finally {
        setLoadingOlderMessages(false);
      }
    };
  const firstUnreadId = messages.find((message) => message.isUnread)?.id,
    trackMessageScroll = () => {
      const list = messageListRef.current;
      if (!list) return;
      if (list.scrollTop < 80) void loadOlderMessages();
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
      {liveToast && <button className="live-notification-toast" onClick={() => setLiveToast(null)}><span>{liveToast.type.includes("group") ? "👥" : liveToast.type.includes("friend") ? "👤" : "💬"}</span><strong>{liveToast.title}</strong><small>{liveToast.body}</small></button>}
      <aside className="app-sidebar">
        <button className="app-logo" onClick={() => setView("home")}>
          W
        </button>
        <nav>
          <button
            aria-label="Home"
            className={view === "home" ? "active" : ""}
            onClick={() => { setMobilePeopleOpen(false); setView("home"); }}
          >
            ⌂<span>Home</span>
          </button>
          <button
            aria-label="Messages"
            className={view === "chat" ? "active" : ""}
            onClick={() => {
              if (window.matchMedia("(max-width: 900px)").matches) {
                setMobilePeopleOpen(true);
                return;
              }
              if (selected) setView("chat");
            }}
          >
            💬<span>Messages</span>
            {unread > 0 && <b>{unread}</b>}
          </button>
          <button aria-label="Groups" className={view === "groups" ? "active" : ""} onClick={() => { setMobilePeopleOpen(false); setView("groups"); }}>
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
      <section className={`people-panel ${mobilePeopleOpen ? "mobile-open" : ""}`}>
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
            totalCount={others.length}
            people={others.filter((x) =>
              x.name.toLowerCase().includes(query.toLowerCase()),
            )}
            selected={selected}
            choose={choose}
            add={add}
            collapsible
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
      {mobilePeopleOpen && <button className="mobile-people-backdrop" aria-label="Close people list" onClick={() => setMobilePeopleOpen(false)} />}
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
            <button className="notification-trigger" aria-label="Notifications" onClick={() => setNotice(!notice)}>
              🔔{notificationCount > 0 && <b>{notificationCount}</b>}
            </button>
            <Avatar name={me.name} avatarUrl={me.avatarUrl} />
            {notice && (
              <div className="notice-pop">
                <div className="notice-heading"><strong>Notifications</strong><div>{notificationCount > 0 && <button onClick={readAllNotifications}>Mark all read</button>}{notifications.some((item) => item.isRead) && <button onClick={deleteReadNotifications}>Delete read</button>}</div></div>
                {incomingRequests.map((x) => {
                  const isUnread = notifications.some((item) => item.type === "friend-request" && item.targetKind === "person" && item.targetId === x.id && !item.isRead);
                  return <div className={`friend-notice request-notice ${isUnread ? "unread" : "read"}`} key={`friend-${x.id}`} onClick={() => isUnread && markTargetNotifications("person", x.id)}>
                    <Avatar name={x.name} avatarUrl={x.avatarUrl} />
                    <span><small>Friend request</small><strong>{x.name} sent you a friend request</strong></span>
                    {isUnread && <i className="request-unread-dot" aria-label="Unread" />}
                    <div><button onClick={() => acceptFriend(x)}>Accept</button><button className="decline" onClick={() => declineFriend(x)}>Decline</button></div>
                  </div>;
                })}
                {pendingGroups.map((room) => {
                  const isUnread = notifications.some((item) => item.type === "group-invite" && item.targetKind === "group" && item.targetId === room.id && !item.isRead);
                  return <div className={`friend-notice group-invite-notice request-notice ${isUnread ? "unread" : "read"}`} key={`group-${room.id}`} onClick={() => isUnread && markTargetNotifications("group", room.id)}>
                    <div className="avatar">👥</div><span><small>Group invitation</small><strong>{room.invitedBy} invited you to join {room.name}</strong></span>
                    {isUnread && <i className="request-unread-dot" aria-label="Unread" />}
                    <div><button onClick={() => acceptGroup(room)}>Accept</button><button className="decline" onClick={() => declineGroup(room)}>Decline</button></div>
                  </div>;
                })}
                {!incomingRequests.length && !pendingGroups.length && (
                  <div className="notification-empty">
                    <i>✓</i>
                    <strong>You're all caught up</strong>
                    <span>Nothing new right now. New friend requests and group invitations will show up here.</span>
                  </div>
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
            </div>
            <ServiceCountdown />
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
        {view === "groups" && <GroupSpace rooms={groupRooms} people={people} me={me} initialRoomId={selectedGroupId} onRoomsChanged={refreshGroups} onRoomRead={handleRoomRead} />}
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
              <button className="profile-avatar-button" aria-label={`View ${selected.name} profile`} onClick={() => setProfilePerson(selected)}><Avatar name={selected.name} avatarUrl={selected.avatarUrl} /></button>
              <span>
                <strong>{selected.name}</strong>
                <small>
                  <i
                    className={selected.online ? "online-dot" : "offline-dot"}
                  />
                  {selected.online ? "Online" : "Offline"}
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
              {hasOlderMessages && <button className="load-older-messages" type="button" onClick={loadOlderMessages} disabled={loadingOlderMessages}>{loadingOlderMessages ? "Loading…" : "Load older messages"}</button>}
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
                          <span className={`${m.readAt ? "read-state read" : "read-state"} ${m.deliveryStatus || ""}`}>
                            {m.readAt ? " ✓✓ Read" : m.deliveryStatus === "sending" ? " Sending…" : m.deliveryStatus === "failed" ? " Failed" : m.deliveryStatus === "delivered" ? " ✓✓ Delivered" : " ✓ Sent"}
                          </span>
                          {m.deliveryStatus === "failed" && <button className="retry-message" type="button" onClick={(event) => { event.stopPropagation(); retryMessage(m); }}>Retry</button>}
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
              <textarea
                rows={1}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (selectedId) localStorage.setItem(`woven-draft-${selectedId}`, event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Type something…"
              />
              <button className="send" disabled={sending || !draft.trim()} aria-label={sending ? "Sending message" : "Send message"}>{sending ? "…" : "↑"}</button>
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
                  <div className="message-detail-actions"><button onClick={() => replyToMessage(messageDetails)}>Reply</button>{messageDetails.senderId === (me.id || me.userId) && <><button onClick={() => editMessage(messageDetails)}>Edit message</button>{Date.now() - new Date(messageDetails.sentAt).getTime() <= 300000 ? <button className="danger" onClick={() => deleteMessage(messageDetails)}>Delete for everyone</button> : <span className="delete-expired">Delete available for 5 minutes</span>}</>}</div>
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
              <span>🔔</span><div><strong>Notifications</strong><small>Show a notification when Woven is in the background.</small></div><i className={desktopNotifications ? "enabled" : ""} />
            </button>
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
        {profilePerson && (
          <div className="person-profile-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setProfilePerson(null)}>
            <section className="person-profile-card">
              <button className="person-profile-close" aria-label="Close profile" onClick={() => setProfilePerson(null)}>×</button>
              <Avatar name={profilePerson.name} avatarUrl={profilePerson.avatarUrl} />
              <h3>{profilePerson.name}</h3>
              <span className="person-profile-status"><i className={profilePerson.online ? "online-dot" : "offline-dot"} />{profilePerson.online ? "Online" : "Offline"}</span>
              <p>{profilePerson.bio || "No description yet."}</p>
              <div className="profile-friend-facts"><span><b>{profilePerson.mutualGroups || 0}</b> mutual groups</span>{profilePerson.friendSince && <span>Friends since <b>{new Date(profilePerson.friendSince).toLocaleDateString()}</b></span>}</div>
              <div className="person-profile-actions">
                <button onClick={() => setProfilePerson(null)}>Cancel</button>
                {profilePerson.friendshipStatus === "accepted" && <><button className="primary-action" onClick={() => { choose(profilePerson); setProfilePerson(null); }}>Message</button><button className="danger" onClick={() => removeFriend(profilePerson)}>Remove friend</button></>}
                {!profilePerson.friendshipStatus && <button className="primary-action" onClick={() => requestFromProfile(profilePerson)}>Add friend</button>}
                {profilePerson.friendshipStatus === "pending" && !profilePerson.incoming && <button className="danger-outline" onClick={() => cancelRequestFromProfile(profilePerson)}>Cancel request</button>}
                {profilePerson.friendshipStatus === "pending" && profilePerson.incoming && <><button className="danger-outline" onClick={() => declineFromProfile(profilePerson)}>Decline</button><button className="primary-action" onClick={() => acceptFromProfile(profilePerson)}>Accept</button></>}
              </div>
            </section>
          </div>
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
            <div className="game-input-row"><input type="number" min="1" max="100" value={guess} disabled={guessCompleted} placeholder="Your guess" onChange={(event) => setGuess(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !guessCompleted && checkGuess()} /><button onMouseDown={(event) => event.preventDefault()} onClick={guessCompleted ? resetGuess : checkGuess}>{guessCompleted ? "New Game" : "Guess"}</button></div>
            <div className={guessCompleted ? "game-message success" : "game-message"}><p>{guessHint}</p><span>Attempts: {attempts}</span></div>
          </article>
          <article className="reaction-card classic-reaction-card">
          <div className="game-heading"><div className="game-icon">⚡</div><div><h3>Reaction Speed</h3><p>Click when the colour changes.</p></div></div>
          <div className="reaction-score"><div><span>Latest</span><strong>{reactionTime === null ? "—" : `${reactionTime} ms`}</strong></div><div><span>Best</span><strong>{bestReaction === null ? "—" : `${bestReaction} ms`}</strong></div></div>
          {reaction === "idle" && <button className="reaction-start" onMouseDown={(event) => event.preventDefault()} onClick={startReaction}>Start Reaction Test</button>}
          {reaction === "waiting" && <button className="reaction-zone waiting" onMouseDown={(event) => event.preventDefault()} onClick={hitReaction}>Wait for green...</button>}
          {reaction === "ready" && <button className="reaction-zone ready" onMouseDown={(event) => event.preventDefault()} onClick={hitReaction}>CLICK NOW!</button>}
          {reaction === "early" && <div className="reaction-result early"><strong>Too early!</strong><span>Wait until the area turns green.</span><button onMouseDown={(event) => event.preventDefault()} onClick={startReaction}>Try Again</button></div>}
          {reaction === "finished" && <div className="reaction-result finished"><strong>{reactionTime} ms</strong><span>{reactionRating}</span><button onMouseDown={(event) => event.preventDefault()} onClick={startReaction}>Play Again</button></div>}
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
function ServiceCountdown() {
  const deadline = new Date(import.meta.env.VITE_SERVICE_END_DATE || "2026-09-26T23:59:59+08:00").getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, deadline - Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <section className={`service-countdown ${remaining === 0 ? "expired" : ""}`} aria-label="Hosting countdown">
      <div><span>HOSTING STATUS</span><strong>{remaining === 0 ? "Service deadline reached" : "Woven hosting ends in"}</strong></div>
      {remaining > 0 && <div className="countdown-units">
        <span><b>{days}</b><small>Days</small></span>
        <span><b>{hours}</b><small>Hours</small></span>
        <span><b>{minutes}</b><small>Minutes</small></span>
        <span><b>{seconds}</b><small>Seconds</small></span>
      </div>}
    </section>
  );
}
function Group({
  title,
  people,
  selected,
  choose,
  add,
  totalCount,
  collapsible = false,
}: {
  title: string;
  people: Person[];
  selected: Person | null;
  choose: (p: Person) => void;
  add?: (p: Person) => void;
  totalCount?: number;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const sortedPeople = [...people].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return (
    <div className="people-group">
      <h4 className={collapsible ? "collapsible" : ""}>
        <button type="button" onClick={() => collapsible && setOpen((value) => !value)} aria-expanded={!collapsible || open}>
          {title}
          <span>{totalCount ?? people.length}</span>
          {collapsible && <i>{open ? "⌃" : "⌄"}</i>}
        </button>
      </h4>
      {(!collapsible || open) && sortedPeople.map((p) => (
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
              <small>{p.online ? "Online" : "Offline"}</small>
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
