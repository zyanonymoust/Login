using Login.Server.Data;
using Login.Server.Models;
using Login.Server.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace Login.Server.Controllers;

[Authorize, ApiController, Route("api/messages")]
public class MessagesController(AppDbContext db, IHubContext<ChatHub> hub) : ControllerBase
{
    private static readonly IReadOnlyDictionary<string, string[]> AllowedAttachmentTypes = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = ["image/png"], [".jpg"] = ["image/jpeg"], [".jpeg"] = ["image/jpeg"], [".gif"] = ["image/gif"], [".webp"] = ["image/webp"],
        [".pdf"] = ["application/pdf"], [".txt"] = ["text/plain"], [".zip"] = ["application/zip", "application/x-zip-compressed"],
        [".doc"] = ["application/msword"], [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        [".xls"] = ["application/vnd.ms-excel"], [".xlsx"] = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
    };
    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("recent")]
    public async Task<IActionResult> Recent()
    {
        var me = UserId;
        var directRows = await db.Messages.AsNoTracking()
            .Where(x => x.SenderId == me || x.RecipientId == me)
            .OrderByDescending(x => x.SentAt)
            .Take(100)
            .Select(x => new { x.SenderId, x.RecipientId, senderName = x.Sender.Name, recipientName = x.Recipient.Name, x.Content, x.AttachmentName, x.SentAt })
            .ToListAsync();
        var direct = directRows.GroupBy(x => x.SenderId == me ? x.RecipientId : x.SenderId).Select(x =>
        {
            var latest = x.First();
            return new RecentConversation("person", x.Key, latest.SenderId == me ? latest.recipientName : latest.senderName, latest.Content.Length > 0 ? latest.Content : latest.AttachmentName ?? "Attachment", latest.SentAt, 0);
        });
        var groupIds = await db.GroupMembers.AsNoTracking().Where(x => x.UserId == me && x.Status == "accepted").Select(x => x.GroupRoomId).ToListAsync();
        var groupRows = await db.GroupMessages.AsNoTracking()
            .Where(x => groupIds.Contains(x.GroupRoomId))
            .OrderByDescending(x => x.SentAt)
            .Take(100)
            .Select(x => new { x.GroupRoomId, x.GroupRoom.Name, x.Content, x.SentAt, memberCount = x.GroupRoom.Members.Count(m => m.Status == "accepted") })
            .ToListAsync();
        var groups = groupRows.GroupBy(x => x.GroupRoomId).Select(x =>
        {
            var latest = x.First();
            return new RecentConversation("group", x.Key, latest.Name, latest.Content, latest.SentAt, latest.memberCount);
        });
        return Ok(direct.Concat(groups).OrderByDescending(x => x.ActivityAt).Take(3));
    }

    [HttpGet("{otherId:int}")]
    public async Task<IActionResult> Conversation(int otherId, [FromQuery] long after = 0)
    {
        var me = UserId;
        var rows = await db.Messages.Where(x => x.Id > after && ((x.SenderId == me && x.RecipientId == otherId) || (x.SenderId == otherId && x.RecipientId == me))).OrderBy(x => x.Id).Take(200).Select(x => new { x.Id, x.SenderId, x.RecipientId, x.Content, x.SentAt, x.ReadAt, isUnread = x.SenderId == otherId && x.RecipientId == me && x.ReadAt == null, x.AttachmentName, x.AttachmentContentType, attachmentUrl = x.AttachmentData != null ? $"/api/messages/attachment/{x.Id}" : null, replyTo = x.ReplyTo == null ? null : new { x.ReplyTo.Id, x.ReplyTo.SenderId, x.ReplyTo.Content, x.ReplyTo.AttachmentName }, reactions = x.Reactions.GroupBy(r => r.Emoji).Select(g => new { emoji = g.Key, count = g.Count(), reactedByMe = g.Any(r => r.UserId == me) }) }).ToListAsync();
        var readCount = await db.Messages.Where(x => x.SenderId == otherId && x.RecipientId == me && x.ReadAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReadAt, DateTime.UtcNow));
        await db.Notifications.Where(x => x.UserId == me && x.Type == "message" && x.TargetKind == "person" && x.TargetId == otherId && !x.IsRead).ExecuteUpdateAsync(x => x.SetProperty(n => n.IsRead, true));
        if (readCount > 0) await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessagesRead", new { readBy = me, readAt = DateTime.UtcNow });
        return Ok(rows);
    }

    [HttpPost("{otherId:int}")]
    public async Task<IActionResult> Send(int otherId, MessageRequest request)
    {
        var content = request.Content.Trim(); if (content.Length is < 1 or > 4000) return BadRequest(new { message = "Message must be between 1 and 4000 characters." });
        if (!await db.Users.AnyAsync(x => x.Id == otherId)) return NotFound();
        var replyTo = request.ReplyToId.HasValue
            ? await db.Messages.AsNoTracking().Where(x => x.Id == request.ReplyToId && ((x.SenderId == UserId && x.RecipientId == otherId) || (x.SenderId == otherId && x.RecipientId == UserId))).Select(x => new { x.Id, x.SenderId, x.Content, x.AttachmentName }).FirstOrDefaultAsync()
            : null;
        if (request.ReplyToId.HasValue && replyTo is null) return BadRequest(new { message = "The replied message is not part of this conversation." });
        var senderName = await db.Users.Where(x => x.Id == UserId).Select(x => x.Name).SingleAsync();
        var row = new ChatMessage { SenderId = UserId, RecipientId = otherId, Content = content, ReplyToId = replyTo?.Id };
        db.Messages.Add(row);
        var muted = await db.ConversationPreferences.AnyAsync(x => x.UserId == otherId && x.OtherUserId == UserId && x.IsMuted);
        if (!muted) await AddOrGroupNotification(otherId, "message", senderName, content, "person", UserId);
        await db.SaveChangesAsync();
        var payload = new { row.Id, row.SenderId, row.RecipientId, row.Content, row.SentAt, row.ReadAt, row.AttachmentName, row.AttachmentContentType, attachmentUrl = (string?)null, replyTo, reactions = Array.Empty<object>(), request.ClientMessageId };
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessageReceived", payload);
        if (!muted) await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("NotificationReceived", new { type = "message", title = senderName, body = content, targetKind = "person", targetId = UserId });
        await hub.Clients.Group(ChatHub.UserGroup(UserId)).SendAsync("MessageSent", payload);
        return Ok(payload);
    }

    [HttpPut("item/{messageId:long}")]
    public async Task<IActionResult> Edit(long messageId, MessageRequest request)
    {
        var content = request.Content.Trim();
        if (content.Length is < 1 or > 4000) return BadRequest(new { message = "Message must be between 1 and 4000 characters." });
        var row = await db.Messages.FirstOrDefaultAsync(x => x.Id == messageId && x.SenderId == UserId);
        if (row is null) return NotFound(new { message = "Message not found or cannot be edited." });
        row.Content = content;
        await db.SaveChangesAsync();
        var payload = new { row.Id, row.Content };
        await hub.Clients.Group(ChatHub.UserGroup(row.SenderId)).SendAsync("MessageUpdated", payload);
        await hub.Clients.Group(ChatHub.UserGroup(row.RecipientId)).SendAsync("MessageUpdated", payload);
        return Ok(payload);
    }

    [HttpDelete("item/{messageId:long}")]
    public async Task<IActionResult> Delete(long messageId)
    {
        var row = await db.Messages.FirstOrDefaultAsync(x => x.Id == messageId && x.SenderId == UserId);
        if (row is null) return NotFound(new { message = "Message not found or cannot be deleted." });
        if (DateTime.UtcNow - row.SentAt > TimeSpan.FromMinutes(5)) return Conflict(new { message = "Messages can only be deleted within 5 minutes of sending." });
        var senderId = row.SenderId;
        var recipientId = row.RecipientId;
        db.Messages.Remove(row);
        await db.SaveChangesAsync();
        await hub.Clients.Group(ChatHub.UserGroup(senderId)).SendAsync("MessageDeleted", new { id = messageId });
        await hub.Clients.Group(ChatHub.UserGroup(recipientId)).SendAsync("MessageDeleted", new { id = messageId });
        return NoContent();
    }

    [HttpPost("item/{messageId:long}/reactions")]
    public async Task<IActionResult> ToggleReaction(long messageId, ReactionRequest request)
    {
        var allowed = new[] { "👍", "❤️", "😂", "😮", "😢", "🎉" };
        if (!allowed.Contains(request.Emoji)) return BadRequest(new { message = "Choose a supported reaction." });
        var message = await db.Messages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == messageId && (x.SenderId == UserId || x.RecipientId == UserId));
        if (message is null) return NotFound();
        var existing = await db.MessageReactions.FirstOrDefaultAsync(x => x.MessageId == messageId && x.UserId == UserId && x.Emoji == request.Emoji);
        var added = existing is null;
        if (added) db.MessageReactions.Add(new MessageReaction { MessageId = messageId, UserId = UserId, Emoji = request.Emoji });
        else db.MessageReactions.Remove(existing!);
        await db.SaveChangesAsync();
        var reactions = await db.MessageReactions.AsNoTracking().Where(x => x.MessageId == messageId).GroupBy(x => x.Emoji).Select(g => new { emoji = g.Key, count = g.Count() }).ToListAsync();
        var payload = new { id = messageId, reactions, userId = UserId, emoji = request.Emoji, added };
        await hub.Clients.Group(ChatHub.UserGroup(message.SenderId)).SendAsync("MessageReactionsChanged", payload);
        await hub.Clients.Group(ChatHub.UserGroup(message.RecipientId)).SendAsync("MessageReactionsChanged", payload);
        return Ok(payload);
    }

    [HttpGet("{otherId:int}/preference")]
    public async Task<IActionResult> Preference(int otherId)
    {
        if (!await db.Users.AnyAsync(x => x.Id == otherId)) return NotFound();
        var muted = await db.ConversationPreferences.AsNoTracking().Where(x => x.UserId == UserId && x.OtherUserId == otherId).Select(x => x.IsMuted).FirstOrDefaultAsync();
        return Ok(new { muted });
    }

    [HttpPut("{otherId:int}/preference")]
    public async Task<IActionResult> SetPreference(int otherId, PreferenceRequest request)
    {
        if (otherId == UserId || !await db.Users.AnyAsync(x => x.Id == otherId)) return BadRequest();
        var preference = await db.ConversationPreferences.FirstOrDefaultAsync(x => x.UserId == UserId && x.OtherUserId == otherId);
        if (preference is null) db.ConversationPreferences.Add(new ConversationPreference { UserId = UserId, OtherUserId = otherId, IsMuted = request.Muted });
        else preference.IsMuted = request.Muted;
        await db.SaveChangesAsync();
        return Ok(new { muted = request.Muted });
    }

    [HttpPost("{otherId:int}/attachment")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> SendAttachment(int otherId, IFormFile file, [FromForm] string? caption)
    {
        if (file.Length is < 1 or > 10_000_000) return BadRequest(new { message = "File must be smaller than 10 MB." });
        if (!await db.Users.AnyAsync(x => x.Id == otherId)) return NotFound();
        var safeName = Path.GetFileName(file.FileName);
        var extension = Path.GetExtension(safeName);
        if (!AllowedAttachmentTypes.TryGetValue(extension, out var contentTypes) || !contentTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "This file type is not allowed." });
        var safeCaption = (caption ?? string.Empty).Trim();
        if (safeCaption.Length > 4000) return BadRequest(new { message = "Caption must be 4000 characters or fewer." });
        await using var stream = new MemoryStream(); await file.CopyToAsync(stream);
        var senderName = await db.Users.Where(x => x.Id == UserId).Select(x => x.Name).SingleAsync();
        var row = new ChatMessage { SenderId = UserId, RecipientId = otherId, Content = safeCaption, AttachmentName = safeName, AttachmentContentType = file.ContentType, AttachmentData = stream.ToArray() };
        db.Messages.Add(row);
        var muted = await db.ConversationPreferences.AnyAsync(x => x.UserId == otherId && x.OtherUserId == UserId && x.IsMuted);
        if (!muted) await AddOrGroupNotification(otherId, "message", senderName, safeCaption.Length > 0 ? safeCaption : $"Sent {safeName}", "person", UserId);
        await db.SaveChangesAsync();
        var payload = new { row.Id, row.SenderId, row.RecipientId, row.Content, row.SentAt, row.ReadAt, row.AttachmentName, row.AttachmentContentType, attachmentUrl = $"/api/messages/attachment/{row.Id}" };
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessageReceived", payload);
        if (!muted) await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("NotificationReceived", new { type = "message", title = senderName, body = safeCaption.Length > 0 ? safeCaption : $"Sent {safeName}", targetKind = "person", targetId = UserId });
        await hub.Clients.Group(ChatHub.UserGroup(UserId)).SendAsync("MessageSent", payload);
        return Ok(payload);
    }

    [HttpGet("attachment/{messageId:long}")]
    public async Task<IActionResult> Attachment(long messageId)
    {
        var me = UserId;
        var item = await db.Messages.AsNoTracking().Where(x => x.Id == messageId && (x.SenderId == me || x.RecipientId == me) && x.AttachmentData != null).Select(x => new { x.AttachmentData, x.AttachmentContentType, x.AttachmentName }).FirstOrDefaultAsync();
        if (item is null) return NotFound();
        return File(item.AttachmentData!, item.AttachmentContentType ?? "application/octet-stream", item.AttachmentName);
    }
    public record MessageRequest(string Content, long? ReplyToId = null, string? ClientMessageId = null);
    public record ReactionRequest(string Emoji);
    public record PreferenceRequest(bool Muted);
    public record RecentConversation(string Kind, int Id, string Name, string Preview, DateTime ActivityAt, int MemberCount);
    private async Task AddOrGroupNotification(int userId, string type, string title, string body, string targetKind, int targetId)
    {
        var existing = await db.Notifications.FirstOrDefaultAsync(x => x.UserId == userId && x.Type == type && x.TargetKind == targetKind && x.TargetId == targetId && !x.IsRead);
        if (existing is null) db.Notifications.Add(new Notification { UserId = userId, Type = type, Title = title, Body = body, TargetKind = targetKind, TargetId = targetId });
        else { existing.Title = title; existing.Body = body; existing.Count++; existing.CreatedAt = DateTime.UtcNow; }
    }
}
