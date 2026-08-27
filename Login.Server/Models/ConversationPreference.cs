namespace Login.Server.Models;

public class ConversationPreference
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int OtherUserId { get; set; }
    public bool IsMuted { get; set; }
    public User User { get; set; } = null!;
    public User OtherUser { get; set; } = null!;
}
