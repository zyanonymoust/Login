namespace Login.Server.Models;

public class WorldMessage
{
    public long Id { get; set; }
    public int SenderId { get; set; }
    public string Channel { get; set; } = "general";
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public bool IsPinned { get; set; }
    public DateTime? PinnedUntil { get; set; }
    public long? ReplyToId { get; set; }
    public string? AttachmentName { get; set; }
    public string? AttachmentContentType { get; set; }
    public byte[]? AttachmentData { get; set; }
    public User Sender { get; set; } = null!;
    public WorldMessage? ReplyTo { get; set; }
    public List<WorldMessage> Replies { get; set; } = [];
    public List<WorldMessageReaction> Reactions { get; set; } = [];
}
