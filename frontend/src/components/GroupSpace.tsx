import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";
import { apiRequest } from "../services/api";
import type { GroupRoom } from "../pages/Dashboard";
import "./GroupSpace.css";

type Person = { id: number; name: string; friendshipStatus?: string };
type Me = { id?: number; userId?: number; name: string };
type GroupMessage = {
  id: number;
  groupRoomId: number;
  senderId: number;
  senderName: string;
  content: string;
  sentAt: string;
  isPinned?: boolean;
  pinnedUntil?: string;
};
type Member = {
  userId: number;
  name: string;
  status: string;
  role: string;
  isMuted: boolean;
  doNotDisturb: boolean;
  online: boolean;
};

export default function GroupSpace({
  rooms,
  people,
  me,
  initialRoomId,
  onRoomsChanged,
  onRoomRead,
}: {
  rooms: GroupRoom[];
  people: Person[];
  me: Me;
  initialRoomId?: number | null;
  onRoomsChanged: () => void;
  onRoomRead: (roomId: number) => void;
}) {
  const [active, setActive] = useState<GroupRoom | null>(null),
    [messages, setMessages] = useState<GroupMessage[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [draft, setDraft] = useState(""),
    [newName, setNewName] = useState(""),
    [newDescription, setNewDescription] = useState(""),
    [isPublic, setIsPublic] = useState(true),
    [showCreate, setShowCreate] = useState(false),
    [showDetails, setShowDetails] = useState(false),
    [detailName, setDetailName] = useState(""),
    [detailDescription, setDetailDescription] = useState(""),
    [savingDetails, setSavingDetails] = useState(false),
    [connection, setConnection] = useState<HubConnection | null>(null),
    [meeting, setMeeting] = useState(false),
    [pinMenuId, setPinMenuId] = useState<number | null>(null),
    [pinNow, setPinNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setPinNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const accepted = rooms.filter((x) => x.status === "accepted"),
    pending = rooms.filter((x) => x.status === "pending"),
    publicRooms = rooms.filter((x) => x.status === "available");
  useEffect(() => {
    if (!initialRoomId) return;
    const room = rooms.find(
      (x) => x.id === initialRoomId && x.status === "accepted",
    );
    if (room && active?.id !== room.id) setActive(room);
  }, [initialRoomId, rooms, active?.id]);
  useEffect(() => {
    if (
      active &&
      !rooms.some((x) => x.id === active.id && x.status === "accepted")
    )
      setActive(null);
  }, [rooms, active]);
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
        .build();
    c.on("GroupMessageReceived", (m: GroupMessage) =>
      setMessages((x) =>
        m.groupRoomId === active?.id && !x.some((y) => y.id === m.id)
          ? [...x, m]
          : x,
      ),
    );
    c.on("GroupMessagePinned", ({ id, groupRoomId, isPinned, pinnedUntil }: { id: number; groupRoomId: number; isPinned: boolean; pinnedUntil?: string }) => setMessages((items) => groupRoomId === active?.id ? items.map((item) => item.id === id ? { ...item, isPinned, pinnedUntil } : item) : items));
    c.start()
      .then(() => setConnection(c))
      .catch(() => {});
    return () => {
      c.stop().catch(() => {});
    };
  }, [active?.id]);
  useEffect(() => {
    if (!active) return;
    apiRequest<GroupMessage[]>(`/api/groups/${active.id}/messages`).then((items) => {
      setMessages(items);
      onRoomRead(active.id);
    });
    apiRequest<Member[]>(`/api/groups/${active.id}/members`).then(setMembers);
    connection?.invoke("JoinRoom", active.id).catch(() => {});
  }, [active, connection, onRoomRead]);
  const create = async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!newName.trim()) return;
      const room = await apiRequest<GroupRoom>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDescription, isPublic }),
      });
      setNewName("");
      setNewDescription("");
      setShowCreate(false);
      await onRoomsChanged();
      setActive(room);
    },
    send = async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!active || !draft.trim()) return;
      const content = draft;
      setDraft("");
      try {
        const m = await apiRequest<GroupMessage>(`/api/groups/${active.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
        setMessages((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      } catch (error) { window.alert(error instanceof Error ? error.message : "Message could not be sent."); }
    },
    pinMessage = async (message: GroupMessage, days: 0 | 1 | 7 | 30) => {
      if (!active) return;
      const result = await apiRequest<{ id: number; isPinned: boolean; pinnedUntil?: string }>(`/api/groups/${active.id}/messages/${message.id}/pin`, { method: "PUT", body: JSON.stringify({ days }) });
      setMessages((items) => items.map((item) => item.id === result.id ? { ...item, isPinned: result.isPinned, pinnedUntil: result.pinnedUntil } : item)); setPinMenuId(null);
    },
    invite = async (userId: number) => {
      if (!active) return;
      try {
        await apiRequest(`/api/groups/${active.id}/invite/${userId}`, {
          method: "POST",
        });
        setMembers(
          await apiRequest<Member[]>(`/api/groups/${active.id}/members`),
        );
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Invite failed");
      }
    },
    accept = async (room: GroupRoom) => {
      await apiRequest(`/api/groups/${room.id}/accept`, { method: "POST" });
      onRoomsChanged();
    },
    decline = async (room: GroupRoom) => {
      await apiRequest(`/api/groups/${room.id}/invite`, { method: "DELETE" });
      onRoomsChanged();
    },
    joinPublic = async (room: GroupRoom) => {
      await apiRequest(`/api/groups/${room.id}/join`, { method: "POST" });
      await onRoomsChanged();
      setActive({
        ...room,
        status: "accepted",
        role: "member",
        memberCount: room.memberCount + 1,
      });
    },
    setDnd = async () => {
      if (!active) return; const enabled = !active.doNotDisturb;
      await apiRequest(`/api/groups/${active.id}/dnd`, { method: "POST", body: JSON.stringify({ enabled }) });
      setActive({ ...active, doNotDisturb: enabled }); onRoomsChanged();
    },
    leaveRoom = async () => {
      if (!active || !window.confirm(`Leave ${active.name}?`)) return;
      try { await apiRequest(`/api/groups/${active.id}/leave`, { method: "DELETE" }); setActive(null); onRoomsChanged(); }
      catch (error) { window.alert(error instanceof Error ? error.message : "Could not leave room."); }
    },
    muteMember = async (member: Member) => {
      if (!active) return; await apiRequest(`/api/groups/${active.id}/members/${member.userId}/mute`, { method: "POST", body: JSON.stringify({ muted: !member.isMuted }) });
      setMembers((items) => items.map((x) => x.userId === member.userId ? { ...x, isMuted: !x.isMuted } : x));
    },
    changeRole = async (member: Member) => {
      if (!active) return;
      const role = member.role === "admin" ? "member" : "admin";
      await apiRequest(`/api/groups/${active.id}/members/${member.userId}/role`, { method: "PUT", body: JSON.stringify({ role }) });
      setMembers((items) => items.map((x) => x.userId === member.userId ? { ...x, role } : x));
    },
    removeMember = async (member: Member) => {
      if (!active || !window.confirm(`Remove ${member.name} from ${active.name}?`)) return;
      await apiRequest(`/api/groups/${active.id}/members/${member.userId}`, { method: "DELETE" });
      setMembers((items) => items.filter((x) => x.userId !== member.userId));
      await onRoomsChanged();
    },
    transferOwnership = async (member: Member) => {
      if (!active || !window.confirm(`Make ${member.name} the owner of ${active.name}? You will become a member.`)) return;
      await apiRequest(`/api/groups/${active.id}/transfer/${member.userId}`, { method: "POST" });
      setActive({ ...active, role: "member" });
      setShowDetails(false);
      await onRoomsChanged();
    },
    openDetails = () => {
      if (!active) return;
      setDetailName(active.name);
      setDetailDescription(active.description || "");
      setShowDetails(true);
    },
    saveDetails = async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!active || !detailName.trim()) return;
      setSavingDetails(true);
      try {
        await apiRequest(`/api/groups/${active.id}/details`, { method: "PUT", body: JSON.stringify({ name: detailName, description: detailDescription }) });
        setActive({ ...active, name: detailName.trim(), description: detailDescription.trim() });
        await onRoomsChanged();
      } finally {
        setSavingDetails(false);
      }
    };
  return (
    <section className="group-space">
      <aside className="room-list">
        <div>
          <h3>Groups</h3>
          <button onClick={() => setShowCreate(!showCreate)}>＋</button>
        </div>
        {showCreate && (
          <form className="create-room-form" onSubmit={create}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name"
              autoFocus
            />
            <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="What is this group about?" maxLength={500} />
            <div className="room-privacy">
              <button type="button" className={isPublic ? "active" : ""} onClick={() => setIsPublic(true)}>🌐 Public</button>
              <button type="button" className={!isPublic ? "active" : ""} onClick={() => setIsPublic(false)}>🔒 Private</button>
            </div>
            <button>Create group</button>
          </form>
        )}
        {pending.map((r) => (
          <div className="room-invite" key={r.id}>
            <strong>{r.name}</strong>
            <small>{r.invitedBy} invited you</small>
            <span>
              <button onClick={() => accept(r)}>Accept</button>
              <button onClick={() => decline(r)}>Decline</button>
            </span>
          </div>
        ))}
        {accepted.map((r) => (
          <button
            className={active?.id === r.id ? "room-row active" : "room-row"}
            key={r.id}
            onClick={() => setActive(r)}
          >
            <i>{r.isPublic ? "🌐" : "🔒"}</i>
            <span>
              <strong>{r.name}</strong>
              <small>{r.memberCount} members</small>
            </span>
            {r.unread > 0 && <b className="room-unread">{r.unread}</b>}
          </button>
        ))}
        {publicRooms.length > 0 && <h4 className="discover-title">Discover public groups</h4>}
        {publicRooms.map((r) => (
          <button className="room-row public-room-row" key={r.id} onClick={() => joinPublic(r)}>
            <i>🌐</i><span><strong>{r.name}</strong><small>{r.memberCount} members · Click to join</small></span><b>＋</b>
          </button>
        ))}
      </aside>
      <main className="room-main">
        {!active ? (
          <div className="room-empty">
            <div>👥</div>
            <h2>Create a space together</h2>
            <p>Start a group, invite people, chat, and meet face to face.</p>
            <button onClick={() => setShowCreate(true)}>
              Create your first group
            </button>
          </div>
        ) : (
          <>
            <header>
              <div>
                <h3>{active.name}</h3>
                {active.description && <p className="room-description">{active.description}</p>}
                <small>
                  {members.filter((x) => x.status === "accepted").length}{" "}
                  members
                </small>
              </div>
              <div className="room-actions">
                <button onClick={setDnd}>{active.doNotDisturb ? "🔕 DND on" : "🔔 DND"}</button>
                {active.role === "owner" && <button onClick={openDetails}>✎ Details</button>}
                {active.role !== "owner" && <button className="leave-room" onClick={leaveRoom}>Leave</button>}
                <button className="meeting-launch" onClick={() => setMeeting(true)}>◉ Start meeting</button>
              </div>
            </header>
            <div className="room-body">
              <div className="group-messages">
                {messages.some((message) => message.isPinned && (!message.pinnedUntil || new Date(message.pinnedUntil).getTime() > pinNow)) && <div className="group-pinned"><b>📌 Pinned</b>{messages.filter((message) => message.isPinned && (!message.pinnedUntil || new Date(message.pinnedUntil).getTime() > pinNow)).slice(-3).reverse().map((message) => <button key={message.id} onClick={() => document.getElementById(`group-message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{message.senderName}: {message.content}<small>{message.pinnedUntil ? `Until ${new Date(message.pinnedUntil).toLocaleDateString()}` : ""}</small></button>)}</div>}
                {messages.map((m) => (
                  <div
                    id={`group-message-${m.id}`}
                    className={
                      m.senderId === (me.id || me.userId)
                        ? "group-message mine"
                        : "group-message"
                    }
                    key={m.id}
                  >
                    <small>{m.senderName}</small>
                    <p>{m.content}</p>
                    <time>
                      {new Date(m.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {(active.role === "owner" || active.role === "admin") && <span className="pin-duration-wrap"><button className="pin-group-message" onClick={() => m.isPinned ? void pinMessage(m, 0) : setPinMenuId(pinMenuId === m.id ? null : m.id)}>{m.isPinned ? "Unpin" : "Pin"}</button>{pinMenuId === m.id && <span className="pin-duration-menu"><button onClick={() => void pinMessage(m, 1)}>1 day</button><button onClick={() => void pinMessage(m, 7)}>1 week</button><button onClick={() => void pinMessage(m, 30)}>1 month</button></span>}</span>}
                  </div>
                ))}
              </div>
              <aside className="member-panel">
                <h4>Members</h4>
                {members.map((m) => (
                  <div className="member-entry" key={m.userId}>
                    <i className={m.online ? "online-dot" : "offline-dot"} />
                    <span><strong>{m.name}</strong>
                      <small>
                        {m.isMuted ? "Muted" : m.status}
                        {m.role === "owner" ? " · owner" : ""}
                      </small>
                    </span>
                    {active.role === "owner" && m.role !== "owner" && <button className="mute-member" onClick={() => muteMember(m)}>{m.isMuted ? "Unmute" : "Mute"}</button>}
                  </div>
                ))}
                <h4>Invite people</h4>
                {people
                  .filter((p) => !members.some((m) => m.userId === p.id))
                  .slice(0, 8)
                  .map((p) => (
                    <button key={p.id} onClick={() => invite(p.id)}>
                      <span>{p.name}</span>＋
                    </button>
                  ))}
              </aside>
            </div>
            <form className="group-composer" onSubmit={send}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type something…"
              />
              <button>↑</button>
            </form>
            {meeting && connection && (
              <Meeting
                room={active}
                connection={connection}
                me={me}
                close={() => setMeeting(false)}
              />
            )}
            {showDetails && active.role === "owner" && (
              <div className="group-details-backdrop" onClick={() => setShowDetails(false)}>
                <section className="group-details-modal" onClick={(event) => event.stopPropagation()}>
                  <header>
                    <div><small>OWNER CONTROLS</small><h2>Group details</h2><p>Manage information and member permissions.</p></div>
                    <button onClick={() => setShowDetails(false)}>×</button>
                  </header>
                  <form onSubmit={saveDetails}>
                    <label>Group name<input value={detailName} onChange={(event) => setDetailName(event.target.value)} minLength={2} maxLength={100} required /></label>
                    <label>Description<textarea value={detailDescription} onChange={(event) => setDetailDescription(event.target.value)} maxLength={500} placeholder="What is this group about?" /></label>
                    <div className="group-visibility"><span>{active.isPublic ? "🌐" : "🔒"}</span><div><strong>{active.isPublic ? "Public group" : "Private group"}</strong><small>{active.isPublic ? "Anyone can discover and join this group." : "People must receive and accept an invitation."}</small></div></div>
                    <button className="save-group-details" disabled={savingDetails}>{savingDetails ? "Saving…" : "Save group details"}</button>
                  </form>
                  <div className="permission-section">
                    <div className="permission-heading"><div><h3>Member permissions</h3><p>{members.length} total members and invitations</p></div><span>{members.filter((member) => member.status === "accepted").length} active</span></div>
                    <div className="permission-list">
                      {members.map((member) => (
                        <div className="permission-member" key={member.userId}>
                          <i className={member.online ? "online-dot" : "offline-dot"} />
                          <div><strong>{member.name}</strong><em>{member.role === "owner" ? "Owner" : member.status === "pending" ? "Invitation pending" : member.role === "admin" ? "Administrator" : member.doNotDisturb ? "Do not disturb" : "Member"}</em></div>
                          {member.role === "owner" ? <div className="member-owner-badge">Owner</div> : <div className="member-controls"><div className="message-permission"><span><strong>{member.isMuted ? "Cannot talk" : "Can talk"}</strong><small>Send group messages</small></span><button type="button" className={member.isMuted ? "" : "enabled"} onClick={() => muteMember(member)} aria-label={`${member.isMuted ? "Allow" : "Mute"} ${member.name}`}><i /></button></div><div className="member-actions"><button type="button" onClick={() => changeRole(member)}>{member.role === "admin" ? "Remove admin" : "Make admin"}</button><button type="button" onClick={() => transferOwnership(member)}>Transfer owner</button><button type="button" className="danger" onClick={() => removeMember(member)}>Remove</button></div></div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </section>
  );
}

function Meeting({
  room,
  connection,
  me,
  close,
}: {
  room: GroupRoom;
  connection: HubConnection;
  me: Me;
  close: () => void;
}) {
  const localVideo = useRef<HTMLVideoElement>(null),
    localStream = useRef<MediaStream | null>(null),
    peers = useRef(new Map<string, RTCPeerConnection>()),
    [remote, setRemote] = useState<{ id: string; stream: MediaStream }[]>([]),
    [muted, setMuted] = useState(false),
    [camera, setCamera] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const activePeers = peers.current;
    const makePeer = (id: string) => {
      let pc = activePeers.get(id);
      if (pc) return pc;
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      localStream.current
        ?.getTracks()
        .forEach((t) => pc!.addTrack(t, localStream.current!));
      pc.onicecandidate = (e) =>
        e.candidate &&
        connection.invoke(
          "RelayMeetingSignal",
          room.id,
          id,
          "ice",
          JSON.stringify(e.candidate),
        );
      pc.ontrack = (e) =>
        setRemote((x) =>
          x.some((y) => y.id === id) ? x : [...x, { id, stream: e.streams[0] }],
        );
      activePeers.set(id, pc);
      return pc;
    };
    const joined = async ({ connectionId }: { connectionId: string }) => {
      const pc = makePeer(connectionId),
        offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await connection.invoke(
        "RelayMeetingSignal",
        room.id,
        connectionId,
        "offer",
        JSON.stringify(offer),
      );
    };
    const signal = async ({
      roomId,
      fromConnectionId,
      kind,
      payload,
    }: {
      roomId: number;
      fromConnectionId: string;
      kind: string;
      payload: string;
    }) => {
      if (roomId !== room.id) return;
      const pc = makePeer(fromConnectionId),
        data = JSON.parse(payload);
      if (kind === "offer") {
        await pc.setRemoteDescription(data);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await connection.invoke(
          "RelayMeetingSignal",
          room.id,
          fromConnectionId,
          "answer",
          JSON.stringify(answer),
        );
      } else if (kind === "answer") await pc.setRemoteDescription(data);
      else if (kind === "ice") await pc.addIceCandidate(data);
    };
    const left = ({ connectionId }: { connectionId: string }) => {
      activePeers.get(connectionId)?.close();
      activePeers.delete(connectionId);
      setRemote((x) => x.filter((y) => y.id !== connectionId));
    };
    connection.on("MeetingParticipantJoined", joined);
    connection.on("MeetingSignal", signal);
    connection.on("MeetingParticipantLeft", left);
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!alive) return;
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        return connection.invoke("JoinMeeting", room.id);
      })
      .catch(() =>
        setError("Camera or microphone permission was not granted."),
      );
    return () => {
      alive = false;
      connection.off("MeetingParticipantJoined", joined);
      connection.off("MeetingSignal", signal);
      connection.off("MeetingParticipantLeft", left);
      connection.invoke("LeaveMeeting", room.id).catch(() => {});
      localStream.current?.getTracks().forEach((t) => t.stop());
      activePeers.forEach((p) => p.close());
    };
  }, [connection, room.id]);
  const leave = () => close(),
    toggleMute = () => {
      const next = !muted;
      localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      setMuted(next);
    },
    toggleCamera = () => {
      const next = !camera;
      localStream.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      setCamera(next);
    };
  return (
    <div className="meeting-modal">
      <header>
        <div>
          <strong>{room.name}</strong>
          <small>
            Live meeting · {remote.length + 1} participant
            {remote.length ? "s" : ""}
          </small>
        </div>
        <button onClick={leave}>×</button>
      </header>
      {error ? (
        <div className="meeting-error">{error}</div>
      ) : (
        <div className="video-grid">
          <VideoTile videoRef={localVideo} label={`${me.name} (you)`} />
          {remote.map((x) => (
            <VideoTile key={x.id} stream={x.stream} label="Room member" />
          ))}
        </div>
      )}
      <footer>
        <button onClick={toggleMute}>{muted ? "🔇 Unmute" : "🎙 Mute"}</button>
        <button onClick={toggleCamera}>
          {camera ? "📷 Camera off" : "📷 Camera on"}
        </button>
        <button className="leave" onClick={leave}>
          Leave meeting
        </button>
      </footer>
    </div>
  );
}
function VideoTile({
  videoRef,
  stream,
  label,
}: {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  stream?: MediaStream;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="video-tile">
      <video ref={videoRef || ref} autoPlay playsInline muted={!!videoRef} />
      <span>{label}</span>
    </div>
  );
}
