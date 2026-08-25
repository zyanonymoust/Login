using Login.Server.Data;
using Login.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Login.Server.Hubs;
using System.Security.Claims;

namespace Login.Server.Controllers;

[Authorize, ApiController, Route("api/social")]
public class SocialController(AppDbContext db, IHubContext<ChatHub> hub) : ControllerBase
{
    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("people")]
    public async Task<IActionResult> People()
    {
        var me = UserId;
        var links = await db.Friendships.Where(x => x.RequesterId == me || x.AddresseeId == me).ToListAsync();
        var users = await db.Users.AsNoTracking().Where(x => x.Id != me).OrderBy(x => x.Name).ToListAsync();
        return Ok(users.Select(u => {
            var link = links.FirstOrDefault(x => x.RequesterId == u.Id || x.AddresseeId == u.Id);
            return new { u.Id, u.Name, u.Email, u.Bio, u.Status, online = u.LastSeenAt > DateTime.UtcNow.AddMinutes(-2), friendshipStatus = link?.Status, incoming = link?.AddresseeId == me, unread = db.Messages.Count(m => m.SenderId == u.Id && m.RecipientId == me && m.ReadAt == null) };
        }));
    }

    [HttpPost("heartbeat")]
    public async Task<IActionResult> Heartbeat() { var u = await db.Users.FindAsync(UserId); if (u is null) return NotFound(); u.LastSeenAt = DateTime.UtcNow; await db.SaveChangesAsync(); return NoContent(); }

    [HttpPost("friends/{otherId:int}")]
    public async Task<IActionResult> AddFriend(int otherId)
    {
        if (otherId == UserId || !await db.Users.AnyAsync(x => x.Id == otherId)) return BadRequest(new { message = "Invalid user." });
        var existing = await db.Friendships.FirstOrDefaultAsync(x => (x.RequesterId == UserId && x.AddresseeId == otherId) || (x.RequesterId == otherId && x.AddresseeId == UserId));
        if (existing is null)
        {
            db.Friendships.Add(new Friendship { RequesterId = UserId, AddresseeId = otherId });
            await db.SaveChangesAsync();
            await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestReceived", new { fromUserId = UserId });
        }
        else if (existing.AddresseeId == UserId)
        {
            existing.Status = "accepted";
            await db.SaveChangesAsync();
            await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestUpdated", new { userId = UserId, status = "accepted" });
        }
        return Ok();
    }

    [HttpPost("friends/{otherId:int}/accept")]
    public async Task<IActionResult> AcceptFriend(int otherId)
    {
        var request = await db.Friendships.FirstOrDefaultAsync(x => x.RequesterId == otherId && x.AddresseeId == UserId && x.Status == "pending");
        if (request is null) return NotFound(new { message = "Friend request not found." });
        request.Status = "accepted"; await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestUpdated", new { userId = UserId, status = "accepted" });
        return Ok();
    }

    [HttpDelete("friends/{otherId:int}")]
    public async Task<IActionResult> DeclineFriend(int otherId)
    {
        var request = await db.Friendships.FirstOrDefaultAsync(x => x.RequesterId == otherId && x.AddresseeId == UserId && x.Status == "pending");
        if (request is null) return NotFound(new { message = "Friend request not found." });
        db.Friendships.Remove(request); await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestUpdated", new { userId = UserId, status = "declined" });
        return NoContent();
    }

    [HttpPut("profile")]
    public async Task<IActionResult> Profile(ProfileRequest request)
    {
        var u = await db.Users.FindAsync(UserId); if (u is null) return NotFound();
        var allowedStatuses = new[] { "Available", "Busy", "Away", "Do Not Disturb" };
        var status = allowedStatuses.FirstOrDefault(x => x.Equals(request.Status?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (status is null) return BadRequest(new { message = "Choose a valid status." });
        u.Name = request.Name.Trim(); u.Bio = request.Bio.Trim(); u.Status = status;
        await db.SaveChangesAsync(); return Ok(new { u.Id, u.Name, u.Email, u.Bio, u.Status });
    }
    public record ProfileRequest(string Name, string Bio, string Status);
}
