using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Login.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Login.Server.Tests;

public class WorldChatApiTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public WorldChatApiTests(CustomWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task RegisteredUser_CanSendAndReadWorldMessage()
    {
        var user = await CreateUser("World Sender");
        var sent = await user.Client.PostAsJsonAsync("/api/world/messages", new { channel = "general", content = "Hello world", clientMessageId = Guid.NewGuid().ToString() });
        sent.EnsureSuccessStatusCode();
        var messages = await user.Client.GetFromJsonAsync<JsonElement>("/api/world/messages?channel=general&limit=50");
        Assert.Contains(messages.EnumerateArray(), item => item.GetProperty("content").GetString() == "Hello world");
    }

    [Fact]
    public async Task BlockedUsers_DisappearAndCannotSendDirectMessage()
    {
        var first = await CreateUser("Blocker");
        var second = await CreateUser("Blocked");
        (await first.Client.PostAsync($"/api/social/blocks/{second.Id}", null)).EnsureSuccessStatusCode();
        var direct = await second.Client.PostAsJsonAsync($"/api/messages/{first.Id}", new { content = "hidden" });
        var people = await first.Client.GetFromJsonAsync<JsonElement>("/api/social/people");
        Assert.Equal(HttpStatusCode.Conflict, direct.StatusCode);
        Assert.DoesNotContain(people.EnumerateArray(), item => item.GetProperty("id").GetInt32() == second.Id);
    }

    [Fact]
    public async Task OnlyAdmin_CanChangeWorldSettings()
    {
        var admin = await CreateUser("World Admin");
        var member = await CreateUser("World Member");
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.FindAsync(admin.Id); user!.IsAdmin = true; await db.SaveChangesAsync();
        }
        var denied = await member.Client.PutAsJsonAsync("/api/world/admin/settings", new { announcement = "No", slowModeSeconds = 2 });
        var allowed = await admin.Client.PutAsJsonAsync("/api/world/admin/settings", new { announcement = "Welcome", slowModeSeconds = 2 });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    private async Task<(HttpClient Client, int Id)> CreateUser(string name)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { name, email = $"{Guid.NewGuid():N}@example.com", password = "123456", confirmPassword = "123456" });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", json.GetProperty("token").GetString());
        return (client, json.GetProperty("userId").GetInt32());
    }
}
