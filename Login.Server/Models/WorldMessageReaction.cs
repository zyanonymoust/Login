namespace Login.Server.Models;

public class WorldMessageReaction
{
    public long Id { get; set; }
    public long WorldMessageId { get; set; }
    public int UserId { get; set; }
    public string Emoji { get; set; } = string.Empty;
    public WorldMessage WorldMessage { get; set; } = null!;
    public User User { get; set; } = null!;
}
