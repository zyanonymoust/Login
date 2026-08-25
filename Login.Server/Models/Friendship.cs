namespace Login.Server.Models;

public class Friendship
{
    public int Id { get; set; }
    public int RequesterId { get; set; }
    public int AddresseeId { get; set; }
    public string Status { get; set; } = "pending";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User Requester { get; set; } = null!;
    public User Addressee { get; set; } = null!;
}
