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
        var rows = await db.Messages.Where(x => x.Id > after && ((x.SenderId == me && x.RecipientId == otherId) || (x.SenderId == otherId && x.RecipientId == me))).OrderBy(x => x.Id).Take(200).Select(x => new { x.Id, x.SenderId, x.RecipientId, x.Content, x.SentAt, x.ReadAt, x.AttachmentName, x.AttachmentContentType, attachmentUrl = x.AttachmentData != null ? $"/api/messages/attachment/{x.Id}" : null }).ToListAsync();
        var readCount = await db.Messages.Where(x => x.SenderId == otherId && x.RecipientId == me && x.ReadAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReadAt, DateTime.UtcNow));
        if (readCount > 0) await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessagesRead", new { readBy = me, readAt = DateTime.UtcNow });
        return Ok(rows);
    }

    [HttpPost("{otherId:int}")]
    public async Task<IActionResult> Send(int otherId, MessageRequest request)
    {
        var content = request.Content.Trim(); if (content.Length is < 1 or > 4000) return BadRequest(new { message = "Message must be between 1 and 4000 characters." });
        if (!await db.Users.AnyAsync(x => x.Id == otherId)) return NotFound();
        var senderName = await db.Users.Where(x => x.Id == UserId).Select(x => x.Name).SingleAsync();
        var row = new ChatMessage { SenderId = UserId, RecipientId = otherId, Content = content };
        db.Messages.Add(row);
        db.Notifications.Add(new Notification { UserId = otherId, Type = "message", Title = senderName, Body = content, TargetKind = "person", TargetId = UserId });
        await db.SaveChangesAsync();
        var payload = new { row.Id, row.SenderId, row.RecipientId, row.Content, row.SentAt, row.ReadAt, row.AttachmentName, row.AttachmentContentType, attachmentUrl = (string?)null };
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessageReceived", payload);
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("NotificationReceived", new { type = "message", targetKind = "person", targetId = UserId });
        await hub.Clients.Group(ChatHub.UserGroup(UserId)).SendAsync("MessageSent", payload);
        return Ok(payload);
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
        db.Notifications.Add(new Notification { UserId = otherId, Type = "message", Title = senderName, Body = safeCaption.Length > 0 ? safeCaption : $"Sent {safeName}", TargetKind = "person", TargetId = UserId });
        await db.SaveChangesAsync();
        var payload = new { row.Id, row.SenderId, row.RecipientId, row.Content, row.SentAt, row.ReadAt, row.AttachmentName, row.AttachmentContentType, attachmentUrl = $"/api/messages/attachment/{row.Id}" };
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessageReceived", payload);
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("NotificationReceived", new { type = "message", targetKind = "person", targetId = UserId });
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
    public record MessageRequest(string Content);
    public record RecentConversation(string Kind, int Id, string Name, string Preview, DateTime ActivityAt, int MemberCount);
}
