using Login.Server.Data;
using Login.Server.Hubs;
using Login.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Login.Server.Controllers;

[Authorize, ApiController, Route("api/groups")]
public class GroupsController(AppDbContext db, IHubContext<ChatHub> hub) : ControllerBase
{
    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var me = UserId;
        var memberships = await db.GroupMembers.AsNoTracking().Where(x => x.UserId == me)
            .Select(x => new { id = x.GroupRoomId, x.GroupRoom.Name, x.GroupRoom.Description, x.GroupRoom.IsPublic, status = x.Status, role = x.Role, x.IsMuted, x.DoNotDisturb, x.GroupRoom.CreatedAt, memberCount = x.GroupRoom.Members.Count(m => m.Status == "accepted"), invitedBy = x.GroupRoom.CreatedBy.Name }).ToListAsync();
        var joinedIds = memberships.Select(x => x.id).ToList();
        var publicRooms = await db.GroupRooms.AsNoTracking().Where(x => x.IsPublic && !joinedIds.Contains(x.Id))
            .Select(x => new { id = x.Id, x.Name, x.Description, x.IsPublic, status = "available", role = "visitor", IsMuted = false, DoNotDisturb = false, x.CreatedAt, memberCount = x.Members.Count(m => m.Status == "accepted"), invitedBy = x.CreatedBy.Name }).ToListAsync();
        return Ok(memberships.Concat(publicRooms).OrderByDescending(x => x.CreatedAt));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateRoom request)
    {
        var name = request.Name.Trim(); if (name.Length is < 2 or > 100) return BadRequest(new { message = "Room name must be 2–100 characters." });
        var room = new GroupRoom { Name = name, Description = (request.Description ?? string.Empty).Trim(), CreatedById = UserId, IsPublic = request.IsPublic };
        room.Members.Add(new GroupMember { UserId = UserId, Status = "accepted", Role = "owner" });
        db.GroupRooms.Add(room); await db.SaveChangesAsync(); return Ok(new { room.Id, room.Name, room.Description, room.IsPublic, status = "accepted", role = "owner", IsMuted = false, DoNotDisturb = false, memberCount = 1, invitedBy = "You", room.CreatedAt });
    }

    [HttpPost("{roomId:int}/join")]
    public async Task<IActionResult> JoinPublic(int roomId)
    {
        var room = await db.GroupRooms.AsNoTracking().FirstOrDefaultAsync(x => x.Id == roomId && x.IsPublic);
        if (room is null) return NotFound(new { message = "Public room not found." });
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId);
        if (member is null) db.GroupMembers.Add(new GroupMember { GroupRoomId = roomId, UserId = UserId, Status = "accepted" });
        else member.Status = "accepted";
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMembershipChanged", new { roomId, userId = UserId, status = "accepted" });
        return Ok();
    }

    [HttpPost("{roomId:int}/invite/{userId:int}")]
    public async Task<IActionResult> Invite(int roomId, int userId)
    {
        if (!await IsAccepted(roomId, UserId) || userId == UserId) return Forbid();
        if (!await db.Users.AnyAsync(x => x.Id == userId)) return NotFound();
        if (await db.GroupMembers.AnyAsync(x => x.GroupRoomId == roomId && x.UserId == userId)) return Conflict(new { message = "This person is already invited or is a member." });
        db.GroupMembers.Add(new GroupMember { GroupRoomId = roomId, UserId = userId }); await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync("GroupInviteReceived", new { roomId }); return Ok();
    }

    [HttpPost("{roomId:int}/accept")]
    public async Task<IActionResult> Accept(int roomId)
    {
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Status == "pending");
        if (member is null) return NotFound(); member.Status = "accepted"; await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMembershipChanged", new { roomId, userId = UserId, status = "accepted" }); return Ok();
    }

    [HttpDelete("{roomId:int}/invite")]
    public async Task<IActionResult> Decline(int roomId)
    {
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Status == "pending");
        if (member is null) return NotFound(); db.GroupMembers.Remove(member); await db.SaveChangesAsync(); return NoContent();
    }

    [HttpGet("{roomId:int}/members")]
    public async Task<IActionResult> Members(int roomId)
    {
        if (!await IsAccepted(roomId, UserId)) return Forbid();
        return Ok(await db.GroupMembers.AsNoTracking().Where(x => x.GroupRoomId == roomId).Select(x => new { x.UserId, x.User.Name, x.User.Email, x.Status, x.Role, x.IsMuted, x.DoNotDisturb, online = x.User.LastSeenAt > DateTime.UtcNow.AddMinutes(-2) }).ToListAsync());
    }

    [HttpGet("{roomId:int}/messages")]
    public async Task<IActionResult> Messages(int roomId)
    {
        if (!await IsAccepted(roomId, UserId)) return Forbid();
        return Ok(await db.GroupMessages.AsNoTracking().Where(x => x.GroupRoomId == roomId).OrderBy(x => x.Id).Take(300).Select(x => new { x.Id, x.GroupRoomId, x.SenderId, senderName = x.Sender.Name, x.Content, x.SentAt }).ToListAsync());
    }

    [HttpPost("{roomId:int}/messages")]
    public async Task<IActionResult> Send(int roomId, SendMessage request)
    {
        var membership = await db.GroupMembers.AsNoTracking().FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Status == "accepted");
        if (membership is null) return Forbid(); if (membership.IsMuted) return StatusCode(403, new { message = "The room owner has muted you." }); var content = request.Content.Trim(); if (content.Length is < 1 or > 4000) return BadRequest();
        var row = new GroupChatMessage { GroupRoomId = roomId, SenderId = UserId, Content = content }; db.GroupMessages.Add(row); await db.SaveChangesAsync();
        var name = await db.Users.Where(x => x.Id == UserId).Select(x => x.Name).SingleAsync(); var payload = new { row.Id, row.GroupRoomId, row.SenderId, senderName = name, row.Content, row.SentAt };
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMessageReceived", payload); return Ok(payload);
    }

    [HttpPut("{roomId:int}/details")]
    public async Task<IActionResult> UpdateDetails(int roomId, UpdateRoom request)
    {
        if (!await db.GroupMembers.AnyAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Role == "owner" && x.Status == "accepted")) return Forbid();
        var room = await db.GroupRooms.FindAsync(roomId); if (room is null) return NotFound();
        var name = request.Name.Trim(); if (name.Length is < 2 or > 100 || request.Description.Length > 500) return BadRequest();
        room.Name = name; room.Description = request.Description.Trim(); await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupDetailsChanged", new { roomId, room.Name, room.Description }); return Ok();
    }

    [HttpPost("{roomId:int}/members/{userId:int}/mute")]
    public async Task<IActionResult> MuteMember(int roomId, int userId, MuteRequest request)
    {
        if (!await db.GroupMembers.AnyAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Role == "owner")) return Forbid();
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == userId && x.Role != "owner"); if (member is null) return NotFound();
        member.IsMuted = request.Muted; await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync("GroupMuteChanged", new { roomId, muted = request.Muted }); return Ok();
    }

    [HttpPut("{roomId:int}/members/{userId:int}/role")]
    public async Task<IActionResult> ChangeRole(int roomId, int userId, RoleRequest request)
    {
        if (!await IsOwner(roomId, UserId)) return Forbid();
        var role = request.Role.Trim().ToLowerInvariant();
        if (role is not ("member" or "admin")) return BadRequest(new { message = "Role must be member or admin." });
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == userId && x.Status == "accepted" && x.Role != "owner");
        if (member is null) return NotFound();
        member.Role = role;
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMembershipChanged", new { roomId, userId, status = "role-changed", role });
        return Ok();
    }

    [HttpDelete("{roomId:int}/members/{userId:int}")]
    public async Task<IActionResult> RemoveMember(int roomId, int userId)
    {
        if (!await IsOwner(roomId, UserId) || userId == UserId) return Forbid();
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == userId && x.Role != "owner");
        if (member is null) return NotFound();
        db.GroupMembers.Remove(member);
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMembershipChanged", new { roomId, userId, status = "removed" });
        await hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync("GroupMembershipChanged", new { roomId, userId, status = "removed" });
        return NoContent();
    }

    [HttpPost("{roomId:int}/transfer/{userId:int}")]
    public async Task<IActionResult> TransferOwnership(int roomId, int userId)
    {
        var owner = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Role == "owner" && x.Status == "accepted");
        if (owner is null || userId == UserId) return Forbid();
        var nextOwner = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == userId && x.Status == "accepted");
        var room = await db.GroupRooms.FindAsync(roomId);
        if (nextOwner is null || room is null) return NotFound();
        await using var transaction = await db.Database.BeginTransactionAsync();
        owner.Role = "member";
        nextOwner.Role = "owner";
        nextOwner.IsMuted = false;
        room.CreatedById = userId;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMembershipChanged", new { roomId, userId, status = "owner-transferred" });
        return Ok();
    }

    [HttpPost("{roomId:int}/dnd")]
    public async Task<IActionResult> SetDnd(int roomId, DndRequest request)
    {
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Status == "accepted"); if (member is null) return Forbid();
        member.DoNotDisturb = request.Enabled; await db.SaveChangesAsync(); return Ok();
    }

    [HttpDelete("{roomId:int}/leave")]
    public async Task<IActionResult> Leave(int roomId)
    {
        var member = await db.GroupMembers.FirstOrDefaultAsync(x => x.GroupRoomId == roomId && x.UserId == UserId && x.Status == "accepted"); if (member is null) return NotFound();
        if (member.Role == "owner") return Conflict(new { message = "The owner must keep the room or transfer ownership before leaving." });
        db.GroupMembers.Remove(member); await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.RoomGroup(roomId)).SendAsync("GroupMembershipChanged", new { roomId, userId = UserId, status = "left" }); return NoContent();
    }

    private Task<bool> IsAccepted(int roomId, int userId) => db.GroupMembers.AnyAsync(x => x.GroupRoomId == roomId && x.UserId == userId && x.Status == "accepted");
    private Task<bool> IsOwner(int roomId, int userId) => db.GroupMembers.AnyAsync(x => x.GroupRoomId == roomId && x.UserId == userId && x.Status == "accepted" && x.Role == "owner");
    public record CreateRoom(string Name, bool IsPublic, string? Description);
    public record SendMessage(string Content);
    public record UpdateRoom(string Name, string Description);
    public record MuteRequest(bool Muted);
    public record RoleRequest(string Role);
    public record DndRequest(bool Enabled);
}
