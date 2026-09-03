using System.ComponentModel.DataAnnotations;

namespace Login.Server.Models;

public class UserSession
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;

    [Required, MaxLength(100)]
    public string DeviceId { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string TokenId { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public bool IsActive { get; set; } = true;
}
