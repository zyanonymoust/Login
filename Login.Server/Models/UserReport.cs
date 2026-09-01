namespace Login.Server.Models;

public class UserReport
{
    public long Id { get; set; }
    public int ReporterId { get; set; }
    public int ReportedUserId { get; set; }
    public long? WorldMessageId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public string Status { get; set; } = "open";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User Reporter { get; set; } = null!;
    public User ReportedUser { get; set; } = null!;
    public WorldMessage? WorldMessage { get; set; }
}
