using Login.Server.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Login.Server.Hubs;

[Authorize]
public class ChatHub(AppDbContext db) : Hub
{
    public static string UserGroup(int userId) => $"user-{userId}";

    public override async Task OnConnectedAsync()
    {
        var value = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (int.TryParse(value, out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
            var user = await db.Users.FindAsync(userId);
            if (user is not null) { user.LastSeenAt = DateTime.UtcNow; await db.SaveChangesAsync(); }
            await Clients.All.SendAsync("PresenceChanged", new { userId, online = true });
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var value = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (int.TryParse(value, out var userId))
        {
            var user = await db.Users.FindAsync(userId);
            if (user is not null) { user.LastSeenAt = DateTime.UtcNow; await db.SaveChangesAsync(); }
            await Clients.All.SendAsync("PresenceChanged", new { userId, online = false });
        }
        await base.OnDisconnectedAsync(exception);
    }
}
