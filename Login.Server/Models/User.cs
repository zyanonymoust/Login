using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Login.Server.Models;

public class User
{
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [JsonIgnore]
    public string PasswordHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(160)]
    public string Bio { get; set; } = string.Empty;

    [MaxLength(40)]
    public string Status { get; set; } = "Available";

    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;

    public byte[]? AvatarData { get; set; }

    [MaxLength(40)]
    public string? AvatarContentType { get; set; }

    public bool IsAdmin { get; set; }

    public bool MustChangePassword { get; set; }

    public bool WorldChatDoNotDisturb { get; set; }

    [JsonIgnore]
    public List<TaskItem> Tasks { get; set; } = [];
    [JsonIgnore]
    public List<UserSession> Sessions { get; set; } = [];
}
