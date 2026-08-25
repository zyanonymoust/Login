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
    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

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
        var row = new ChatMessage { SenderId = UserId, RecipientId = otherId, Content = content };
        db.Messages.Add(row); await db.SaveChangesAsync();
        var payload = new { row.Id, row.SenderId, row.RecipientId, row.Content, row.SentAt, row.ReadAt, row.AttachmentName, row.AttachmentContentType, attachmentUrl = (string?)null };
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessageReceived", payload);
        await hub.Clients.Group(ChatHub.UserGroup(UserId)).SendAsync("MessageSent", payload);
        return Ok(payload);
    }

    [HttpPost("{otherId:int}/attachment")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> SendAttachment(int otherId, IFormFile file, [FromForm] string? caption)
    {
        if (file.Length is < 1 or > 10_000_000) return BadRequest(new { message = "File must be smaller than 10 MB." });
        if (!await db.Users.AnyAsync(x => x.Id == otherId)) return NotFound();
        await using var stream = new MemoryStream(); await file.CopyToAsync(stream);
        var row = new ChatMessage { SenderId = UserId, RecipientId = otherId, Content = (caption ?? string.Empty).Trim(), AttachmentName = Path.GetFileName(file.FileName), AttachmentContentType = file.ContentType, AttachmentData = stream.ToArray() };
        db.Messages.Add(row); await db.SaveChangesAsync();
        var payload = new { row.Id, row.SenderId, row.RecipientId, row.Content, row.SentAt, row.ReadAt, row.AttachmentName, row.AttachmentContentType, attachmentUrl = $"/api/messages/attachment/{row.Id}" };
        await hub.Clients.Group(ChatHub.UserGroup(otherId)).SendAsync("MessageReceived", payload);
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
}
