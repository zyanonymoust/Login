namespace Login.Server.Models;

public class WorldChatMute
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int MutedById { get; set; }
    public DateTime? MutedUntil { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User User { get; set; } = null!;
    public User MutedBy { get; set; } = null!;
}
