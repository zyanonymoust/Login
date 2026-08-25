namespace Login.Server.Models;

public class GroupMember
{
    public int Id { get; set; }
    public int GroupRoomId { get; set; }
    public int UserId { get; set; }
    public string Status { get; set; } = "pending";
    public string Role { get; set; } = "member";
    public bool IsMuted { get; set; }
    public bool DoNotDisturb { get; set; }
    public DateTime InvitedAt { get; set; } = DateTime.UtcNow;
    public GroupRoom GroupRoom { get; set; } = null!;
    public User User { get; set; } = null!;
}
