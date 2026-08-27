namespace Login.Server.Models;

public class ChatMessage
{
    public long Id { get; set; }
    public int SenderId { get; set; }
    public int RecipientId { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
    public long? ReplyToId { get; set; }
    public string? AttachmentName { get; set; }
    public string? AttachmentContentType { get; set; }
    public byte[]? AttachmentData { get; set; }
    public User Sender { get; set; } = null!;
    public User Recipient { get; set; } = null!;
    public ChatMessage? ReplyTo { get; set; }
    public List<ChatMessage> Replies { get; set; } = [];
    public List<MessageReaction> Reactions { get; set; } = [];
}
