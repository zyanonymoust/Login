using Login.Server.Data;
using Login.Server.Hubs;
using Login.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Login.Server.Controllers;

[Authorize, ApiController, Route("api/world")]
public class WorldChatController(AppDbContext db, IHubContext<ChatHub> hub) : ControllerBase
{
    public static readonly string[] Channels = ["general", "gaming", "technology", "music", "movies", "study"];
    private static readonly string[] Emojis = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
    private static readonly IReadOnlyDictionary<string, string[]> AttachmentTypes = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = ["image/png"], [".jpg"] = ["image/jpeg"], [".jpeg"] = ["image/jpeg"], [".gif"] = ["image/gif"], [".webp"] = ["image/webp"],
        [".pdf"] = ["application/pdf"], [".txt"] = ["text/plain"], [".zip"] = ["application/zip", "application/x-zip-compressed"],
        [".doc"] = ["application/msword"], [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    };
    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("state")]
    public async Task<IActionResult> State()
    {
        var setting = await GetSettings();
        var mute = await db.WorldChatMutes.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == UserId && (x.MutedUntil == null || x.MutedUntil > DateTime.UtcNow));
        var blockedIds = await db.UserBlocks.AsNoTracking().Where(x => x.BlockerId == UserId).Select(x => x.BlockedId).ToListAsync();
        return Ok(new { channels = Channels, setting.Announcement, setting.SlowModeSeconds, onlineCount = ChatHub.OnlineCount, mutedUntil = mute?.MutedUntil, muteReason = mute?.Reason, blockedIds });
    }

    [HttpGet("messages")]
    public async Task<IActionResult> Messages([FromQuery] string channel = "general", [FromQuery] long? before = null, [FromQuery] int limit = 50)
    {
        channel = NormalizeChannel(channel);
        limit = Math.Clamp(limit, 1, 100);
        var hidden = await db.UserBlocks.AsNoTracking().Where(x => x.BlockerId == UserId).Select(x => x.BlockedId).ToListAsync();
        var query = db.WorldMessages.AsNoTracking().Where(x => x.Channel == channel && !hidden.Contains(x.SenderId));
        if (before.HasValue) query = query.Where(x => x.Id < before.Value);
        var rows = await query.OrderByDescending(x => x.Id).Take(limit).Select(x => new
        {
            x.Id, x.SenderId, senderName = x.Sender.Name, senderAvatarUrl = x.Sender.AvatarData != null ? $"/api/social/avatar/{x.SenderId}" : null,
            x.Channel, x.Content, x.SentAt, isAdmin = x.Sender.IsAdmin, x.AttachmentName, x.AttachmentContentType, attachmentUrl = x.AttachmentData != null ? $"/api/world/messages/{x.Id}/attachment" : null,
            replyTo = x.ReplyTo == null ? null : new { x.ReplyTo.Id, x.ReplyTo.SenderId, senderName = x.ReplyTo.Sender.Name, x.ReplyTo.Content },
            reactions = x.Reactions.GroupBy(r => r.Emoji).Select(g => new { emoji = g.Key, count = g.Count(), reactedByMe = g.Any(r => r.UserId == UserId) })
        }).ToListAsync();
        rows.Reverse();
        return Ok(rows);
    }

    [HttpPost("messages/attachment")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> SendAttachment([FromForm] string channel, IFormFile file, [FromForm] string? caption, [FromForm] long? replyToId)
    {
        channel = NormalizeChannel(channel);
        var mute = await db.WorldChatMutes.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == UserId && (x.MutedUntil == null || x.MutedUntil > DateTime.UtcNow));
        if (mute is not null) return StatusCode(403, new { message = "You are muted from World Chat." });
        if (file.Length is < 1 or > 10_000_000) return BadRequest(new { message = "File must be smaller than 10 MB." });
        var safeName = Path.GetFileName(file.FileName); var extension = Path.GetExtension(safeName);
        if (!AttachmentTypes.TryGetValue(extension, out var types) || !types.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase)) return BadRequest(new { message = "This file type is not allowed." });
        var content = (caption ?? string.Empty).Trim(); if (content.Length > 2000) return BadRequest(new { message = "Caption is too long." });
        var reply = replyToId.HasValue ? await db.WorldMessages.AsNoTracking().Include(x => x.Sender).FirstOrDefaultAsync(x => x.Id == replyToId && x.Channel == channel) : null;
        await using var stream = new MemoryStream(); await file.CopyToAsync(stream);
        var row = new WorldMessage { SenderId = UserId, Channel = channel, Content = content, ReplyToId = reply?.Id, AttachmentName = safeName, AttachmentContentType = file.ContentType, AttachmentData = stream.ToArray() };
        db.WorldMessages.Add(row); await db.SaveChangesAsync();
        var sender = await db.Users.AsNoTracking().Where(x => x.Id == UserId).Select(x => new { x.Name, x.IsAdmin, hasAvatar = x.AvatarData != null }).SingleAsync();
        var payload = new { row.Id, row.SenderId, senderName = sender.Name, senderAvatarUrl = sender.hasAvatar ? $"/api/social/avatar/{UserId}" : null, row.Channel, row.Content, row.SentAt, sender.IsAdmin, row.AttachmentName, row.AttachmentContentType, attachmentUrl = $"/api/world/messages/{row.Id}/attachment", replyTo = reply == null ? null : new { reply.Id, reply.SenderId, senderName = reply.Sender.Name, reply.Content }, reactions = Array.Empty<object>() };
        await hub.Clients.Group(ChatHub.WorldGroup(channel)).SendAsync("WorldMessageReceived", payload);
        return Ok(payload);
    }

    [HttpGet("messages/{messageId:long}/attachment")]
    public async Task<IActionResult> Attachment(long messageId)
    {
        var hidden = await db.UserBlocks.AsNoTracking().Where(x => x.BlockerId == UserId).Select(x => x.BlockedId).ToListAsync();
        var item = await db.WorldMessages.AsNoTracking().Where(x => x.Id == messageId && x.AttachmentData != null && !hidden.Contains(x.SenderId)).Select(x => new { x.AttachmentData, x.AttachmentContentType, x.AttachmentName }).FirstOrDefaultAsync();
        return item is null ? NotFound() : File(item.AttachmentData!, item.AttachmentContentType ?? "application/octet-stream", item.AttachmentName);
    }

    [HttpPost("messages")]
    public async Task<IActionResult> Send(WorldMessageRequest request)
    {
        var channel = NormalizeChannel(request.Channel);
        var content = request.Content.Trim();
        if (content.Length is < 1 or > 2000) return BadRequest(new { message = "World messages must contain 1 to 2000 characters." });
        var mute = await db.WorldChatMutes.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == UserId && (x.MutedUntil == null || x.MutedUntil > DateTime.UtcNow));
        if (mute is not null) return StatusCode(403, new { message = mute.MutedUntil.HasValue ? $"You are muted until {mute.MutedUntil.Value:u}." : "You are permanently muted from World Chat." });
        var setting = await GetSettings();
        var lastSent = await db.WorldMessages.AsNoTracking().Where(x => x.SenderId == UserId).OrderByDescending(x => x.SentAt).Select(x => (DateTime?)x.SentAt).FirstOrDefaultAsync();
        if (lastSent.HasValue && DateTime.UtcNow - lastSent.Value < TimeSpan.FromSeconds(setting.SlowModeSeconds))
            return StatusCode(429, new { message = $"Slow mode is on. Wait {setting.SlowModeSeconds} seconds between messages." });
        var reply = request.ReplyToId.HasValue ? await db.WorldMessages.AsNoTracking().Include(x => x.Sender).FirstOrDefaultAsync(x => x.Id == request.ReplyToId && x.Channel == channel) : null;
        if (request.ReplyToId.HasValue && reply is null) return BadRequest(new { message = "The replied message is unavailable." });
        var row = new WorldMessage { SenderId = UserId, Channel = channel, Content = content, ReplyToId = reply?.Id };
        db.WorldMessages.Add(row);
        await db.SaveChangesAsync();
        var sender = await db.Users.AsNoTracking().Where(x => x.Id == UserId).Select(x => new { x.Name, x.IsAdmin, hasAvatar = x.AvatarData != null }).SingleAsync();
        var payload = new { row.Id, row.SenderId, senderName = sender.Name, senderAvatarUrl = sender.hasAvatar ? $"/api/social/avatar/{UserId}" : null, row.Channel, row.Content, row.SentAt, sender.IsAdmin, replyTo = reply == null ? null : new { reply.Id, reply.SenderId, senderName = reply.Sender.Name, reply.Content }, reactions = Array.Empty<object>(), request.ClientMessageId };
        await hub.Clients.Group(ChatHub.WorldGroup(channel)).SendAsync("WorldMessageReceived", payload);
        return Ok(payload);
    }

    [HttpPost("messages/{messageId:long}/reactions")]
    public async Task<IActionResult> React(long messageId, ReactionRequest request)
    {
        if (!Emojis.Contains(request.Emoji)) return BadRequest(new { message = "Choose a supported reaction." });
        var message = await db.WorldMessages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == messageId);
        if (message is null) return NotFound();
        var existing = await db.WorldMessageReactions.FirstOrDefaultAsync(x => x.WorldMessageId == messageId && x.UserId == UserId && x.Emoji == request.Emoji);
        if (existing is null) db.WorldMessageReactions.Add(new WorldMessageReaction { WorldMessageId = messageId, UserId = UserId, Emoji = request.Emoji }); else db.WorldMessageReactions.Remove(existing);
        await db.SaveChangesAsync();
        var reactions = await db.WorldMessageReactions.AsNoTracking().Where(x => x.WorldMessageId == messageId).GroupBy(x => x.Emoji).Select(g => new { emoji = g.Key, count = g.Count() }).ToListAsync();
        await hub.Clients.Group(ChatHub.WorldGroup(message.Channel)).SendAsync("WorldReactionsChanged", new { id = messageId, reactions });
        return Ok(reactions);
    }

    [HttpDelete("messages/{messageId:long}")]
    public async Task<IActionResult> Delete(long messageId)
    {
        var row = await db.WorldMessages.FirstOrDefaultAsync(x => x.Id == messageId);
        if (row is null) return NotFound();
        var admin = await IsAdmin();
        if (!admin && (row.SenderId != UserId || DateTime.UtcNow - row.SentAt > TimeSpan.FromMinutes(5))) return Forbid();
        var channel = row.Channel;
        db.WorldMessages.Remove(row);
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.WorldGroup(channel)).SendAsync("WorldMessageDeleted", new { id = messageId });
        return NoContent();
    }

    [HttpPost("reports")]
    public async Task<IActionResult> Report(ReportRequest request)
    {
        var reasons = new[] { "spam", "harassment", "unsafe", "impersonation", "other" };
        var reason = request.Reason.Trim().ToLowerInvariant();
        if (!reasons.Contains(reason) || request.Details.Trim().Length > 500) return BadRequest(new { message = "Choose a valid report reason." });
        var message = request.WorldMessageId.HasValue ? await db.WorldMessages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.WorldMessageId) : null;
        var reportedId = message?.SenderId ?? request.ReportedUserId;
        if (reportedId == UserId || !await db.Users.AnyAsync(x => x.Id == reportedId)) return BadRequest();
        db.UserReports.Add(new UserReport { ReporterId = UserId, ReportedUserId = reportedId, WorldMessageId = message?.Id, Reason = reason, Details = request.Details.Trim() });
        await db.SaveChangesAsync();
        return Ok(new { message = "Report submitted." });
    }

    [HttpPut("admin/settings")]
    public async Task<IActionResult> Settings(AdminSettingsRequest request)
    {
        if (!await IsAdmin()) return Forbid();
        if (request.Announcement.Trim().Length > 1000 || request.SlowModeSeconds is < 0 or > 120) return BadRequest();
        var setting = await GetSettings();
        var announcement = request.Announcement.Trim();
        var publishAnnouncement = announcement.Length > 0 && !string.Equals(setting.Announcement, announcement, StringComparison.Ordinal);
        setting.Announcement = announcement; setting.SlowModeSeconds = request.SlowModeSeconds; setting.UpdatedAt = DateTime.UtcNow; setting.UpdatedById = UserId;
        if (publishAnnouncement)
        {
            var userIds = await db.Users.AsNoTracking().Select(x => x.Id).ToListAsync();
            db.Notifications.AddRange(userIds.Select(userId => new Notification { UserId = userId, Type = "global-announcement", Title = "Global Channel", Body = announcement, TargetKind = "world", TargetId = 1 }));
        }
        await db.SaveChangesAsync();
        await hub.Clients.All.SendAsync("WorldSettingsChanged", new { setting.Announcement, setting.SlowModeSeconds });
        if (publishAnnouncement) await hub.Clients.All.SendAsync("NotificationReceived", new { type = "global-announcement", title = "Global Channel", body = announcement, targetKind = "world", targetId = 1 });
        return Ok(new { setting.Announcement, setting.SlowModeSeconds });
    }

    [HttpPut("admin/mutes/{userId:int}")]
    public async Task<IActionResult> Mute(int userId, MuteRequest request)
    {
        if (!await IsAdmin()) return Forbid();
        if (userId <= 2 || !await db.Users.AnyAsync(x => x.Id == userId)) return BadRequest(new { message = "Owners cannot be muted." });
        var mute = await db.WorldChatMutes.FirstOrDefaultAsync(x => x.UserId == userId);
        if (request.Minutes == 0) { if (mute is not null) db.WorldChatMutes.Remove(mute); }
        else if (mute is null) db.WorldChatMutes.Add(new WorldChatMute { UserId = userId, MutedById = UserId, MutedUntil = request.Minutes < 0 ? null : DateTime.UtcNow.AddMinutes(Math.Clamp(request.Minutes, 1, 43200)), Reason = request.Reason.Trim() });
        else { mute.MutedById = UserId; mute.MutedUntil = request.Minutes < 0 ? null : DateTime.UtcNow.AddMinutes(Math.Clamp(request.Minutes, 1, 43200)); mute.Reason = request.Reason.Trim(); mute.CreatedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync("WorldMuteChanged", new { request.Minutes, request.Reason });
        return NoContent();
    }

    [HttpGet("admin/reports")]
    public async Task<IActionResult> Reports()
    {
        if (!await IsAdmin()) return Forbid();
        return Ok(await db.UserReports.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(200).Select(x => new { x.Id, x.Reason, x.Details, x.Status, x.CreatedAt, x.WorldMessageId, reporterName = x.Reporter.Name, reportedUserId = x.ReportedUserId, reportedName = x.ReportedUser.Name }).ToListAsync());
    }

    [HttpGet("owner/admins")]
    public async Task<IActionResult> AdminUsers()
    {
        if (!await IsOwner()) return Forbid();
        return Ok(await db.Users.AsNoTracking().OrderBy(x => x.Id).Select(x => new { x.Id, x.Name, x.IsAdmin, isOwner = x.Id == 1 || x.Id == 2, x.Status, x.MustChangePassword }).ToListAsync());
    }

    [HttpPut("owner/admins/{userId:int}")]
    public async Task<IActionResult> SetAdmin(int userId, AdminPermissionRequest request)
    {
        if (!await IsOwner()) return Forbid();
        if (userId is 1 or 2) return Conflict(new { message = "Owner permissions for users 1 and 2 cannot be removed." });
        var user = await db.Users.FindAsync(userId); if (user is null) return NotFound();
        user.IsAdmin = request.Enabled;
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync("AdminPermissionChanged", new { isAdmin = user.IsAdmin });
        return Ok(new { user.Id, user.Name, user.IsAdmin });
    }

    [HttpPut("owner/users/{userId:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int userId)
    {
        if (!await IsOwner()) return Forbid();
        if (userId is 1 or 2) return Conflict(new { message = "Owner passwords cannot be reset here." });
        var user = await db.Users.FindAsync(userId);
        if (user is null) return NotFound(new { message = "User not found." });
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword("123456");
        user.MustChangePassword = true;
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync("PasswordResetRequired");
        return Ok(new { user.Id, user.Name, temporaryPassword = "123456", user.MustChangePassword });
    }

    [HttpPut("admin/reports/{reportId:long}")]
    public async Task<IActionResult> Review(long reportId, ReviewRequest request)
    {
        if (!await IsAdmin()) return Forbid();
        if (request.Status is not ("resolved" or "dismissed")) return BadRequest();
        var report = await db.UserReports.FindAsync(reportId); if (report is null) return NotFound(); report.Status = request.Status; await db.SaveChangesAsync(); return NoContent();
    }

    private string NormalizeChannel(string channel)
    {
        var value = channel.Trim().ToLowerInvariant();
        if (!Channels.Contains(value)) throw new BadHttpRequestException("Unknown world channel.");
        return value;
    }
    private Task<bool> IsAdmin() => db.Users.AsNoTracking().AnyAsync(x => x.Id == UserId && x.IsAdmin);
    private Task<bool> IsOwner() => db.Users.AsNoTracking().AnyAsync(x => x.Id == UserId && x.IsAdmin && (x.Id == 1 || x.Id == 2));
    private async Task<WorldChatSetting> GetSettings()
    {
        var setting = await db.WorldChatSettings.FirstOrDefaultAsync(x => x.Id == 1);
        if (setting is not null) return setting;
        setting = new WorldChatSetting { Id = 1, Announcement = "Welcome to Woven World Chat", SlowModeSeconds = 5 };
        db.WorldChatSettings.Add(setting);
        await db.SaveChangesAsync();
        return setting;
    }
    public record WorldMessageRequest(string Channel, string Content, long? ReplyToId = null, string? ClientMessageId = null);
    public record ReactionRequest(string Emoji);
    public record ReportRequest(int ReportedUserId, long? WorldMessageId, string Reason, string Details);
    public record AdminSettingsRequest(string Announcement, int SlowModeSeconds);
    public record MuteRequest(int Minutes, string Reason);
    public record ReviewRequest(string Status);
    public record AdminPermissionRequest(bool Enabled);
}
