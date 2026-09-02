namespace Login.Server.Models;

public class WorldAnnouncement
{
    public long Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
}
