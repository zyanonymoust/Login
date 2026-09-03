using System.ComponentModel.DataAnnotations;

namespace Login.Server.DTOs;

public class RegisterRequest
{
    [Required]
    [MaxLength(100)]
    public string Name{ get; set; } = string.Empty;
    
    [Required]
    [EmailAddress]
    [MaxLength(255)]
    public string Email { get; set; } = string.Empty;
    
    [Required]
    [MinLength(6)]
    public string Password { get; set; } = string.Empty;

    [Required]
    [Compare(nameof(Password))]
    public string ConfirmPassword { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? DeviceId { get; set; }
}
