using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Login.Server.Models
{
    public class TaskItem
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;
        
        [MaxLength(2000)]
        public string? Description { get; set; }
        
        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Pending";

        [Required]
        [MaxLength(20)]
        public string Priority { get; set; } = "Medium";

        public DateOnly DueDate { get; set; }

        public TimeOnly? DueTime { get; set; }

        [MaxLength(1000)]
        public string? Remark { get; set; }

        public DateTime? CreatedAt { get; set; } = DateTime.MinValue;

        public DateTime? UpdatedAt { get; set; }

        public DateTime? CompletedAt { get; set; }

        public int UserId { get; set; }

        [JsonIgnore]
        public User User { get; set; } = null!;

    }
}