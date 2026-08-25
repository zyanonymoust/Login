using Login.Server.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Collections.Concurrent;

namespace Login.Server.Hubs;

[Authorize]
public class ChatHub(AppDbContext db) : Hub
{
    private static readonly ConcurrentDictionary<string, HashSet<int>> MeetingRooms = new();
    public static string UserGroup(int userId) => $"user-{userId}";
    public static string RoomGroup(int roomId) => $"room-{roomId}";
    private static string MeetingGroup(int roomId) => $"meeting-{roomId}";

    private int CurrentUserId => int.Parse(Context.User!.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private Task<bool> CanEnter(int roomId) => db.GroupMembers.AnyAsync(x => x.GroupRoomId == roomId && x.UserId == CurrentUserId && x.Status == "accepted");

    public async Task JoinRoom(int roomId)
    {
        if (!await CanEnter(roomId)) throw new HubException("Room access denied.");
        await Groups.AddToGroupAsync(Context.ConnectionId, RoomGroup(roomId));
    }

    public async Task JoinMeeting(int roomId)
    {
        if (!await CanEnter(roomId)) throw new HubException("Meeting access denied.");
        await Groups.AddToGroupAsync(Context.ConnectionId, MeetingGroup(roomId));
        MeetingRooms.AddOrUpdate(Context.ConnectionId, _ => [roomId], (_, set) => { lock (set) set.Add(roomId); return set; });
        var name = await db.Users.Where(x => x.Id == CurrentUserId).Select(x => x.Name).SingleAsync();
        await Clients.OthersInGroup(MeetingGroup(roomId)).SendAsync("MeetingParticipantJoined", new { roomId, connectionId = Context.ConnectionId, userId = CurrentUserId, name });
    }

    public async Task RelayMeetingSignal(int roomId, string targetConnectionId, string kind, string payload)
    {
        if (!await CanEnter(roomId)) throw new HubException("Meeting access denied.");
        await Clients.Client(targetConnectionId).SendAsync("MeetingSignal", new { roomId, fromConnectionId = Context.ConnectionId, kind, payload });
    }

    public async Task LeaveMeeting(int roomId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, MeetingGroup(roomId));
        if (MeetingRooms.TryGetValue(Context.ConnectionId, out var set)) lock (set) set.Remove(roomId);
        await Clients.OthersInGroup(MeetingGroup(roomId)).SendAsync("MeetingParticipantLeft", new { roomId, connectionId = Context.ConnectionId });
    }

    public override async Task OnConnectedAsync()
    {
        var value = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (int.TryParse(value, out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
            var user = await db.Users.FindAsync(userId);
            if (user is not null) { user.LastSeenAt = DateTime.UtcNow; await db.SaveChangesAsync(); }
            await Clients.All.SendAsync("PresenceChanged", new { userId, online = true });
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var value = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (int.TryParse(value, out var userId))
        {
            var user = await db.Users.FindAsync(userId);
            if (user is not null) { user.LastSeenAt = DateTime.UtcNow; await db.SaveChangesAsync(); }
            await Clients.All.SendAsync("PresenceChanged", new { userId, online = false });
        }
        if (MeetingRooms.TryRemove(Context.ConnectionId, out var rooms))
            foreach (var roomId in rooms) await Clients.OthersInGroup(MeetingGroup(roomId)).SendAsync("MeetingParticipantLeft", new { roomId, connectionId = Context.ConnectionId });
        await base.OnDisconnectedAsync(exception);
    }
}
