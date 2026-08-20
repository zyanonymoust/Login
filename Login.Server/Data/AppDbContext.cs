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
    }
}