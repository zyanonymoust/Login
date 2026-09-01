namespace Login.Server.Models;

public class WorldChatSetting
{
    public int Id { get; set; } = 1;
    public string Announcement { get; set; } = string.Empty;
    public int SlowModeSeconds { get; set; } = 5;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public int? UpdatedById { get; set; }
    public User? UpdatedBy { get; set; }
}
