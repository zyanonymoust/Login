import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { useNavigate } from "react-router";
import { API_BASE_URL, apiRequest } from "../services/api";
import { logout } from "../services/auth";
import JumpGame from "../components/JumpGame";
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
};
type Message = {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  sentAt: string;
  readAt?: string;
  attachmentName?: string;
  attachmentContentType?: string;
  attachmentUrl?: string;
};
type Me = {
  id?: number;
  userId?: number;
  name: string;
  email: string;
  bio?: string;
  status?: string;
};
export default function Dashboard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const nav = useNavigate(),
    [me, setMe] = useState<Me>(() =>
      JSON.parse(localStorage.getItem("user") || "{}"),
    ),
    [people, setPeople] = useState<Person[]>([]),
    [selected, setSelected] = useState<Person | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [uploading, setUploading] = useState(false),
    [view, setView] = useState<"chat" | "home" | "profile" | "settings">(
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
    [chatBg, setChatBg] = useState(
      () => localStorage.getItem("woven-chat-bg") || "default",
    );
  const refresh = useCallback(async () => {
    try {
      const d = await apiRequest<Person[]>("/api/social/people");
      setPeople(d);
      setSelected((s) => (s ? d.find((x) => x.id === s.id) || null : s));
    } catch {}
  }, []);
  useEffect(() => {
    apiRequest<Me>("/api/auth/me")
      .then(setMe)
      .catch(() => {});
    refresh();
    apiRequest("/api/social/heartbeat", { method: "POST" }).catch(() => {});
    const t = setInterval(() => {
      refresh();
      apiRequest("/api/social/heartbeat", { method: "POST" }).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    let a = true;
    apiRequest<Message[]>(`/api/messages/${selected.id}`)
      .then((d) => a && setMessages(d))
      .catch(() => {});
    return () => {
      a = false;
    };
  }, [selected]);
  useEffect(() => localStorage.setItem("woven-theme", theme), [theme]);
  useEffect(() => localStorage.setItem("woven-dark", darkMode ? "on" : "off"), [darkMode]);
  useEffect(() => localStorage.setItem("woven-chat-bg", chatBg), [chatBg]);
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
      if (
        selected &&
        (m.senderId === selected.id || m.recipientId === selected.id)
      )
        setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
    });
    c.on("MessageSent", (m: Message) => {
      if (
        selected &&
        (m.senderId === selected.id || m.recipientId === selected.id)
      )
        setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
    });
    c.on("MessagesRead", (r: { readBy: number; readAt: string }) => {
      if (selected?.id === r.readBy)
        setMessages((x) =>
          x.map((m) =>
            m.recipientId === r.readBy ? { ...m, readAt: r.readAt } : m,
          ),
        );
    });
    c.on("PresenceChanged", refresh);
    c.on("FriendRequestReceived", refresh);
    c.on("FriendRequestUpdated", refresh);
    c.start().catch(() => {});
    return () => {
      c.stop().catch(() => {});
    };
  }, [selected, refresh]);
  const friends = people.filter((x) => x.friendshipStatus === "accepted"),
    others = people.filter((x) => x.friendshipStatus !== "accepted"),
    incomingRequests = people.filter((x) => x.friendshipStatus === "pending" && x.incoming),
    unread = people.reduce((a, x) => a + x.unread, 0),
    notificationCount = unread + incomingRequests.length,
    choose = (p: Person) => {
      setSelected(p);
      setView("chat");
    },
    add = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}`, { method: "POST" });
      refresh();
    },
    acceptFriend = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}/accept`, { method: "POST" });
      await refresh();
    },
    declineFriend = async (p: Person) => {
      await apiRequest(`/api/social/friends/${p.id}`, { method: "DELETE" });
      await refresh();
    },
    send = async (e: FormEvent) => {
      e.preventDefault();
      if (!selected || !draft.trim()) return;
      const content = draft;
      setDraft("");
      await apiRequest(`/api/messages/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages(await apiRequest<Message[]>(`/api/messages/${selected.id}`));
    },
    save = async (e: FormEvent<HTMLFormElement>) => {
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
  return (
    <div className={`woven-app theme-${theme} ${darkMode ? "dark" : ""}`}>
      <aside className="app-sidebar">
        <button className="app-logo" onClick={() => setView("home")}>
          W
        </button>
        <nav>
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => setView("home")}
          >
            ⌂<span>Home</span>
          </button>
          <button
            className={view === "chat" ? "active" : ""}
            onClick={() => selected && setView("chat")}
          >
            💬<span>Messages</span>
            {unread > 0 && <b>{unread}</b>}
          </button>
        </nav>
        <div className="side-bottom">
          <button onClick={() => setDarkMode((value) => !value)} title="Toggle dark mode">
            {darkMode ? "☀" : "☾"}<span>Dark mode</span>
          </button>
          <button onClick={() => setView("profile")}>
            ♙<span>Profile</span>
          </button>
          <button onClick={() => setView("settings")}>
            ⚙<span>Settings</span>
          </button>
          <button
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
        <div className="my-card">
          <Avatar name={me.name} />
          <span>
            <strong>{me.name || "You"}</strong>
            <small>{me.status || "Available"}</small>
          </span>
          <i className="online-dot" />
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
                    : "Good day, " + (me.name?.split(" ")[0] || "friend")}
            </h2>
          </div>
          <div className="header-tools">
            <button onClick={() => setNotice(!notice)}>
              ♢{notificationCount > 0 && <b>{notificationCount}</b>}
            </button>
            <Avatar name={me.name} />
            {notice && (
              <div className="notice-pop">
                <strong>Notifications</strong>
                {incomingRequests.map((x) => (
                  <div className="friend-notice" key={`friend-${x.id}`}>
                    <Avatar name={x.name} />
                    <span><strong>{x.name}</strong><small>wants to be your friend</small></span>
                    <div><button onClick={() => acceptFriend(x)}>Accept</button><button className="decline" onClick={() => declineFriend(x)}>Decline</button></div>
                  </div>
                ))}
                {people.filter((x) => x.unread).map((x) => (
                      <button className="message-notice" key={`message-${x.id}`} onClick={() => choose(x)}>
                        {x.unread} new message{x.unread > 1 ? "s" : ""} from{" "}
                        {x.name}
                      </button>
                    ))}
                {!notificationCount && (
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
              <div className="orb">
                <i />
                <Avatar name={me.name} />
              </div>
            </div>
            <h3>Jump back in</h3>
            <div className="quick-grid">
              {friends.slice(0, 3).map((p) => (
                <button key={p.id} onClick={() => choose(p)}>
                  <Avatar name={p.name} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.online ? "Online now" : p.status}</small>
                  </span>
                  <b>→</b>
                </button>
              ))}
              {!friends.length && (
                <div className="empty-card">
                  <b>Your circle starts here</b>
                  <span>Add someone from Public to begin a conversation.</span>
                </div>
              )}
            </div>
            <BoredomBreak />
            <div className="jump-game-wrap"><JumpGame /></div>
          </section>
        )}
        {view === "chat" && selected && (
          <section
            className={`chat-view bg-${chatBg.startsWith("data:") ? "custom" : chatBg}`}
            style={
              chatBg.startsWith("data:")
                ? {
                    backgroundImage: `linear-gradient(#fbfafce8,#fbfafce8), url(${chatBg})`,
                  }
                : undefined
            }
          >
            <div className="chat-meta">
              <Avatar name={selected.name} />
              <span>
                <strong>{selected.name}</strong>
                <small>
                  <i
                    className={selected.online ? "online-dot" : "offline-dot"}
                  />
                  {selected.online ? "Online now" : selected.status}
                </small>
              </span>
            </div>
            {selected.friendshipStatus !== "accepted" && (
              <div className="friend-tip">
                <span>ⓘ</span>
                <p><strong>{selected.name} is not in your friends yet.</strong> Add them to your friends for a trusted connection.</p>
                {selected.friendshipStatus === "pending" && !selected.incoming ? <button disabled>Request sent</button> : selected.incoming ? <div><button onClick={() => acceptFriend(selected)}>Accept</button><button className="decline" onClick={() => declineFriend(selected)}>Decline</button></div> : <button onClick={() => add(selected)}>Add friend</button>}
              </div>
            )}
            <div className="message-list">
              {!messages.length && (
                <div className="start-chat">
                  <Avatar name={selected.name} />
                  <h3>Start something good</h3>
                  <p>Say hello to {selected.name}.</p>
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`message ${m.senderId === (me.id || me.userId) ? "mine" : "theirs"}`}
                >
                  <p>{m.content}</p>
                  {m.attachmentUrl && <MessageAttachment message={m} />}
                  <small>
                    {new Date(m.sentAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.senderId === (me.id || me.userId) && (
                      <span className={m.readAt ? "read-state read" : "read-state"}>
                        {m.readAt ? " ✓✓ Read" : " ✓ Sent"}
                      </span>
                    )}
                  </small>
                </div>
              ))}
            </div>
            <form className="composer" onSubmit={send}>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} title="Add image or file">{uploading ? "…" : "＋"}</button>
              <input ref={fileInput} className="attachment-input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={sendAttachment} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${selected.name}`}
              />
              <button className="send">↑</button>
            </form>
          </section>
        )}
        {view === "profile" && (
          <form className="settings-view" onSubmit={save}>
            <div className="profile-edit">
              <Avatar name={me.name} />
              <div>
                <h3>Your profile</h3>
                <p>What friends see across Woven.</p>
              </div>
            </div>
            <label>
              Display name
              <input name="name" defaultValue={me.name} required />
            </label>
            <label>
              Status
              <input name="status" defaultValue={me.status || "Available"} />
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
        )}
        {view === "settings" && (
          <section className="settings-view">
            <h3>Choose your color</h3>
            <p>The theme stays on this device.</p>
            <div className="swatches">
              {["violet", "ocean", "coral", "forest"].map((x) => (
                <button
                  className={theme === x ? "active" : ""}
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
function Avatar({ name }: { name: string }) {
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

function MessageAttachment({ message }: { message: Message }) {
  const [url, setUrl] = useState("");
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
  if (image) return <a className="image-attachment" href={url} download={message.attachmentName}><img src={url} alt={message.attachmentName || "Shared image"} /><span>{message.attachmentName}</span></a>;
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
  const [prompt, setPrompt] = useState(conversationPrompts[0]);
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

  const shufflePrompt = () => {
    const choices = conversationPrompts.filter((item) => item !== prompt);
    setPrompt(choices[Math.floor(Math.random() * choices.length)]);
  };

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
          <article className="prompt-card">
            <div className="activity-icon">✦</div>
            <small>FRIENDSHIP SPARK</small>
            <h4>{prompt}</h4>
            <button onClick={shufflePrompt}>Give me another <span>↻</span></button>
          </article>
        </div>
      </div>
    </section>
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
              <Avatar name={p.name} />
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
