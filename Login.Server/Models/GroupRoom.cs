namespace Login.Server.Models;

public class GroupRoom
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int CreatedById { get; set; }
    public bool IsPublic { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User CreatedBy { get; set; } = null!;
    public List<GroupMember> Members { get; set; } = [];
    public List<GroupChatMessage> Messages { get; set; } = [];
}
