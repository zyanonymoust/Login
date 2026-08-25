namespace Login.Server.Models;

public class GroupChatMessage
{
    public long Id { get; set; }
    public int GroupRoomId { get; set; }
    public int SenderId { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public GroupRoom GroupRoom { get; set; } = null!;
    public User Sender { get; set; } = null!;
}
