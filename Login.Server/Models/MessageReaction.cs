namespace Login.Server.Models;

public class MessageReaction
{
    public long Id { get; set; }
    public long MessageId { get; set; }
    public int UserId { get; set; }
    public string Emoji { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ChatMessage Message { get; set; } = null!;
    public User User { get; set; } = null!;
}
