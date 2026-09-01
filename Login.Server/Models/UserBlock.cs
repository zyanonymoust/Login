namespace Login.Server.Models;

public class UserBlock
{
    public int Id { get; set; }
    public int BlockerId { get; set; }
    public int BlockedId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User Blocker { get; set; } = null!;
    public User Blocked { get; set; } = null!;
}
