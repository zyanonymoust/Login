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
        var myGroupIds = await db.GroupMembers.AsNoTracking().Where(x => x.UserId == me && x.Status == "accepted").Select(x => x.GroupRoomId).ToListAsync();
        var mutualGroups = await db.GroupMembers.AsNoTracking().Where(x => x.UserId != me && x.Status == "accepted" && myGroupIds.Contains(x.GroupRoomId)).GroupBy(x => x.UserId).Select(x => new { UserId = x.Key, Count = x.Count() }).ToDictionaryAsync(x => x.UserId, x => x.Count);
        return Ok(users.Select(u => {
            var link = links.FirstOrDefault(x => x.RequesterId == u.Id || x.AddresseeId == u.Id);
            var invisible = u.Status == "Invisible";
            return new { u.Id, u.Name, u.Bio, avatarUrl = u.AvatarData != null ? $"/api/social/avatar/{u.Id}" : null, status = invisible ? "Offline" : u.Status, online = !invisible && u.LastSeenAt > DateTime.UtcNow.AddMinutes(-2), friendshipStatus = link?.Status, friendSince = link?.Status == "accepted" ? link.CreatedAt : (DateTime?)null, mutualGroups = mutualGroups.GetValueOrDefault(u.Id), incoming = link?.AddresseeId == me, unread = db.Messages.Count(m => m.SenderId == u.Id && m.RecipientId == me && m.ReadAt == null) };
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
            var senderName = await db.Users.Where(x => x.Id == UserId).Select(x => x.Name).SingleAsync();
            db.Notifications.Add(new Notification { UserId = otherId, Type = "friend-request", Title = senderName, Body = "sent you a friend request", TargetKind = "person", TargetId = UserId });
            await db.SaveChangesAsync();
            await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestReceived", new { fromUserId = UserId });
            await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("NotificationReceived", new { type = "friend-request", title = senderName, body = "sent you a friend request", targetKind = "person", targetId = UserId });
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
        request.Status = "accepted";
        var accepterName = await db.Users.Where(x => x.Id == UserId).Select(x => x.Name).SingleAsync();
        db.Notifications.Add(new Notification { UserId = otherId, Type = "friend-accepted", Title = accepterName, Body = "accepted your friend request", TargetKind = "person", TargetId = UserId });
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestUpdated", new { userId = UserId, status = "accepted" });
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("NotificationReceived", new { type = "friend-accepted", title = accepterName, body = "accepted your friend request", targetKind = "person", targetId = UserId });
        return Ok();
    }

    [HttpDelete("friends/{otherId:int}")]
    public async Task<IActionResult> DeclineFriend(int otherId)
    {
        var request = await db.Friendships.FirstOrDefaultAsync(x => (x.RequesterId == UserId && x.AddresseeId == otherId) || (x.RequesterId == otherId && x.AddresseeId == UserId));
        if (request is null) return NotFound(new { message = "Friendship not found." });
        db.Friendships.Remove(request); await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("FriendRequestUpdated", new { userId = UserId, status = "removed" });
        return NoContent();
    }

    [HttpPut("profile")]
    public async Task<IActionResult> Profile(ProfileRequest request)
    {
        var u = await db.Users.FindAsync(UserId); if (u is null) return NotFound();
        var allowedStatuses = new[] { "Available", "Busy", "Away", "Do Not Disturb", "Invisible" };
        var status = allowedStatuses.FirstOrDefault(x => x.Equals(request.Status?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (status is null) return BadRequest(new { message = "Choose a valid status." });
        u.Name = request.Name.Trim(); u.Bio = request.Bio.Trim(); u.Status = status;
        await db.SaveChangesAsync();
        await hub.Clients.All.SendAsync("PresenceChanged", new { userId = UserId, online = u.Status != "Invisible", status = u.Status });
        return Ok(new { u.Id, u.Name, u.Email, u.Bio, u.Status, avatarUrl = u.AvatarData != null ? $"/api/social/avatar/{u.Id}" : null });
    }
    [HttpPut("status")]
    public async Task<IActionResult> SetStatus(StatusRequest request)
    {
        var allowedStatuses = new[] { "Available", "Busy", "Away", "Do Not Disturb", "Invisible" };
        var status = allowedStatuses.FirstOrDefault(x => x.Equals(request.Status?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (status is null) return BadRequest(new { message = "Choose a valid status." });
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        user.Status = status;
        user.LastSeenAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await hub.Clients.All.SendAsync("PresenceChanged", new { userId = UserId, online = status != "Invisible", status });
        return Ok(new { user.Status });
    }
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        if (request.NewPassword != request.ConfirmPassword || request.NewPassword.Length < 6) return BadRequest(new { message = "New passwords must match and contain at least 6 characters." });
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash)) return BadRequest(new { message = "Current password is incorrect." });
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        await db.SaveChangesAsync();
        return NoContent();
    }
    [HttpPost("avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        var allowed = new[] { "image/png", "image/jpeg", "image/webp" };
        var extensions = new[] { ".png", ".jpg", ".jpeg", ".webp" };
        if (file.Length is < 1 or > 2_000_000 || !allowed.Contains(file.ContentType) || !extensions.Contains(Path.GetExtension(file.FileName), StringComparer.OrdinalIgnoreCase)) return BadRequest(new { message = "Choose a PNG, JPEG, or WebP image smaller than 2 MB." });
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream);
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        user.AvatarData = stream.ToArray();
        user.AvatarContentType = file.ContentType;
        await db.SaveChangesAsync();
        return Ok(new { avatarUrl = $"/api/social/avatar/{UserId}?v={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}" });
    }
    [AllowAnonymous, HttpGet("avatar/{userId:int}")]
    public async Task<IActionResult> Avatar(int userId)
    {
        var avatar = await db.Users.AsNoTracking().Where(x => x.Id == userId && x.AvatarData != null).Select(x => new { x.AvatarData, x.AvatarContentType }).FirstOrDefaultAsync();
        return avatar is null ? NotFound() : File(avatar.AvatarData!, avatar.AvatarContentType ?? "image/png");
    }
    [HttpDelete("avatar")]
    public async Task<IActionResult> DeleteAvatar()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        user.AvatarData = null;
        user.AvatarContentType = null;
        await db.SaveChangesAsync();
        return NoContent();
    }
    public record ProfileRequest(string Name, string Bio, string Status);
    public record StatusRequest(string Status);
    public record ChangePasswordRequest(string CurrentPassword, string NewPassword, string ConfirmPassword);
}
