using Login.Server.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Login.Server.Controllers;

[Authorize, ApiController, Route("api/notifications")]
public class NotificationsController(AppDbContext db) : ControllerBase
{
    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> List()
    {
        return Ok(await db.Notifications.AsNoTracking().Where(x => x.UserId == UserId).OrderByDescending(x => x.CreatedAt).Take(50).Select(x => new { x.Id, x.Type, x.Title, x.Body, x.TargetKind, x.TargetId, x.Count, x.IsRead, x.CreatedAt }).ToListAsync());
    }

    [HttpPost("{id:long}/read")]
    public async Task<IActionResult> Read(long id)
    {
        var updated = await db.Notifications.Where(x => x.Id == id && x.UserId == UserId).ExecuteUpdateAsync(x => x.SetProperty(n => n.IsRead, true));
        return updated == 0 ? NotFound() : NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> ReadAll()
    {
        await db.Notifications.Where(x => x.UserId == UserId && !x.IsRead).ExecuteUpdateAsync(x => x.SetProperty(n => n.IsRead, true));
        return NoContent();
    }

    [HttpDelete("read")]
    public async Task<IActionResult> DeleteRead()
    {
        await db.Notifications.Where(x => x.UserId == UserId && x.IsRead).ExecuteDeleteAsync();
        return NoContent();
    }
}
