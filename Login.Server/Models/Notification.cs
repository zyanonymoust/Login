namespace Login.Server.Models;

public class Notification
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string TargetKind { get; set; } = string.Empty;
    public int TargetId { get; set; }
    public int Count { get; set; } = 1;
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User User { get; set; } = null!;
}
