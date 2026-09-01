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
    public DbSet<GroupRoom> GroupRooms { get; set; }
    public DbSet<GroupMember> GroupMembers { get; set; }
    public DbSet<GroupChatMessage> GroupMessages { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<MessageReaction> MessageReactions { get; set; }
    public DbSet<ConversationPreference> ConversationPreferences { get; set; }
    public DbSet<WorldMessage> WorldMessages { get; set; }
    public DbSet<WorldMessageReaction> WorldMessageReactions { get; set; }
    public DbSet<UserBlock> UserBlocks { get; set; }
    public DbSet<UserReport> UserReports { get; set; }
    public DbSet<WorldChatMute> WorldChatMutes { get; set; }
    public DbSet<WorldChatSetting> WorldChatSettings { get; set; }

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
                entity.Property(user => user.AvatarContentType).HasMaxLength(40);
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
            entity.HasOne(x => x.ReplyTo).WithMany(x => x.Replies).HasForeignKey(x => x.ReplyToId).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<GroupRoom>(entity =>
        {
            entity.HasKey(x => x.Id); entity.Property(x => x.Name).HasMaxLength(100).IsRequired(); entity.Property(x => x.Description).HasMaxLength(500).IsRequired();
            entity.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<GroupMember>(entity =>
        {
            entity.HasKey(x => x.Id); entity.HasIndex(x => new { x.GroupRoomId, x.UserId }).IsUnique();
            entity.Property(x => x.Status).HasMaxLength(20).IsRequired(); entity.Property(x => x.Role).HasMaxLength(20).IsRequired();
            entity.HasOne(x => x.GroupRoom).WithMany(x => x.Members).HasForeignKey(x => x.GroupRoomId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<GroupChatMessage>(entity =>
        {
            entity.HasKey(x => x.Id); entity.HasIndex(x => new { x.GroupRoomId, x.SentAt }); entity.Property(x => x.Content).HasMaxLength(4000).IsRequired();
            entity.HasOne(x => x.GroupRoom).WithMany(x => x.Messages).HasForeignKey(x => x.GroupRoomId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt });
            entity.Property(x => x.Type).HasMaxLength(30).IsRequired();
            entity.Property(x => x.Title).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Body).HasMaxLength(500).IsRequired();
            entity.Property(x => x.TargetKind).HasMaxLength(30).IsRequired();
            entity.Property(x => x.Count).HasDefaultValue(1);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<MessageReaction>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.MessageId, x.UserId, x.Emoji }).IsUnique();
            entity.Property(x => x.Emoji).HasMaxLength(16).IsRequired();
            entity.HasOne(x => x.Message).WithMany(x => x.Reactions).HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ConversationPreference>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserId, x.OtherUserId }).IsUnique();
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.OtherUser).WithMany().HasForeignKey(x => x.OtherUserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<WorldMessage>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.Channel, x.Id });
            entity.Property(x => x.Channel).HasMaxLength(30).IsRequired();
            entity.Property(x => x.Content).HasMaxLength(2000).IsRequired();
            entity.Property(x => x.AttachmentName).HasMaxLength(255);
            entity.Property(x => x.AttachmentContentType).HasMaxLength(120);
            entity.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ReplyTo).WithMany(x => x.Replies).HasForeignKey(x => x.ReplyToId).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<WorldMessageReaction>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.WorldMessageId, x.UserId, x.Emoji }).IsUnique();
            entity.Property(x => x.Emoji).HasMaxLength(16).IsRequired();
            entity.HasOne(x => x.WorldMessage).WithMany(x => x.Reactions).HasForeignKey(x => x.WorldMessageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<UserBlock>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.BlockerId, x.BlockedId }).IsUnique();
            entity.HasOne(x => x.Blocker).WithMany().HasForeignKey(x => x.BlockerId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Blocked).WithMany().HasForeignKey(x => x.BlockedId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<UserReport>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Reason).HasMaxLength(50).IsRequired();
            entity.Property(x => x.Details).HasMaxLength(500);
            entity.Property(x => x.Status).HasMaxLength(20).IsRequired();
            entity.HasOne(x => x.Reporter).WithMany().HasForeignKey(x => x.ReporterId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ReportedUser).WithMany().HasForeignKey(x => x.ReportedUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.WorldMessage).WithMany().HasForeignKey(x => x.WorldMessageId).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<WorldChatMute>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.Property(x => x.Reason).HasMaxLength(300);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.MutedBy).WithMany().HasForeignKey(x => x.MutedById).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<WorldChatSetting>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Announcement).HasMaxLength(1000);
            entity.HasOne(x => x.UpdatedBy).WithMany().HasForeignKey(x => x.UpdatedById).OnDelete(DeleteBehavior.SetNull);
            entity.HasData(new WorldChatSetting { Id = 1, Announcement = "Welcome to Woven World Chat", SlowModeSeconds = 5, UpdatedAt = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc) });
        });
    }
}
