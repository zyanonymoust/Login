using Login.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace Login.Server.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }
    public DbSet<User> Users { get; set; }
    
    public DbSet<TaskItem> Tasks { get; set; }
    public DbSet<Friendship> Friendships { get; set; }
    public DbSet<ChatMessage> Messages { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(
            entity =>
            {
                entity.HasKey(user => user.Id);
                entity.HasIndex(user => user.Email).IsUnique();
                entity.Property(user => user.Name).HasMaxLength(100).IsRequired();
                entity.Property(user => user.Email).HasMaxLength(255).IsRequired();
                entity.Property(user => user.PasswordHash).IsRequired();
                entity.HasMany(user => user.Tasks)
                      .WithOne(task => task.User)
                      .HasForeignKey(task => task.UserId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

        modelBuilder.Entity<TaskItem>(
            entity =>
            {
                entity.HasKey(task => task.Id);
                entity.Property(task => task.Title).HasMaxLength(200).IsRequired();
                entity.Property(task => task.Description).HasMaxLength(2000);
                entity.Property(task => task.Status).HasMaxLength(30).IsRequired();
                entity.Property(task => task.Priority).HasMaxLength(20).IsRequired();
                entity.Property(task => task.Remark).HasMaxLength(1000);
            });

        modelBuilder.Entity<Friendship>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.RequesterId, x.AddresseeId }).IsUnique();
            entity.Property(x => x.Status).HasMaxLength(20).IsRequired();
            entity.HasOne(x => x.Requester).WithMany().HasForeignKey(x => x.RequesterId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Addressee).WithMany().HasForeignKey(x => x.AddresseeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.SenderId, x.RecipientId, x.SentAt });
            entity.Property(x => x.Content).HasMaxLength(4000).IsRequired();
            entity.Property(x => x.AttachmentName).HasMaxLength(255);
            entity.Property(x => x.AttachmentContentType).HasMaxLength(120);
            entity.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Recipient).WithMany().HasForeignKey(x => x.RecipientId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
